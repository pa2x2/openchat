/**
 * Per-chat streaming state machine (app-owned, provider-agnostic).
 *
 * Consumes the closed StreamEvent set through `ChatProvider` and turns it
 * into message-store updates. The adapter normalizes; this module decides
 * what each event means for the UI.
 *
 * One turn = one user prompt plus the assistant reply that follows it.
 * The event subscription is live-only by design: when the stream drops
 * mid-turn, the machine reconciles from `fetchMessages()` (server truth
 * replaces the optimistic transcript) and re-subscribes with exponential
 * backoff while the turn is still live. A watchdog guards against silent
 * stalls: if nothing arrives for a while, the machine reconciles anyway;
 * two consecutive reconciles that see an unchanged message end the turn
 * (its closing events were lost to a gap), unless the backend says the run
 * is still going, as it is while a slow tool works.
 *
 * Reconnection is for *transport* loss only. Errors the server reports about
 * the run itself (provider auth, rejected model, aborted message) are
 * terminal: the same prompt will fail the same way, so retrying them in a
 * loop would spin forever and hide the reason from the user. Every terminal
 * path resolves the turn's completion signal, which keeps `sendMessage`
 * responsive even when a provider iterator ignores its abort signal.
 */

import {
  addCost,
  addUsage,
  totalTokens,
  type Attachment,
  type ChatForm,
  type ChatId,
  type ChatSummary,
  type FormAnswer,
  type FormResult,
  type Message,
  type QueuedMessage,
  type ReplyPart,
  type StreamEvent,
  type ToolCall,
  type TurnActivity,
  type UserMessage,
} from "@/src/domain";
import { getProvider } from "@/src/lib/providerFactory";
import { canResendAttachments } from "@/src/lib/attachments";
import { ConnectionError, type ChatProvider } from "@/src/providers/types";
import { useChatsStore } from "@/src/stores/chats";
import { withFormRecords } from "@/src/stores/formRecords";
import { useMessagesStore } from "@/src/stores/messages";
import { t } from "@/src/i18n";

const INITIAL_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 15_000;
/** Stream silence longer than this triggers a reconcile. */
const STALL_MS = 45_000;
const WATCHDOG_TICK_MS = 5_000;
/**
 * How long a turn whose run ended with messages still queued waits for the
 * run the backend starts for them. It starts at once; this only covers the
 * events' way here.
 */
const LINGER_MS = 5_000;

/**
 * Optimistic messages carry a local id until the server-assigned one arrives.
 * The prefix is how the app tells them apart: backends format their own ids
 * however they like.
 */
const LOCAL_ID_PREFIX = "local-";

function localId(kind: "user" | "assistant"): string {
  return `${LOCAL_ID_PREFIX}${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface RegenerateOutcome {
  ok: boolean;
  error?: string;
}

/**
 * An in-flight assistant reply. Live deltas accumulate on `draft`; a
 * reconcile swaps the draft for the server-confirmed message. Reconciles
 * only run while the stream is down, so no live delta can race the
 * snapshot and duplicate text.
 */
interface LiveTurn {
  chatId: ChatId;
  draft: Message;
  controller: AbortController;
  /** True while a reconcile fetch is in flight; events queue meanwhile. */
  paused: boolean;
  queue: StreamEvent[];
  /** Text at the previous reconcile snapshot; equal twice = turn over. */
  lastSnapshotText: string | null;
  /** Resolves when the local turn lifecycle ends, even if a provider iterator is slow to abort. */
  completion: Promise<void>;
  resolveCompletion: () => void;
  /** Prevents a stale event stream from mutating a turn after it is settled. */
  finished: boolean;
  /**
   * Frame that will copy `draft`'s text and parts to the store, or null
   * when the store is current. Deltas can arrive many per frame; rendering
   * each one would redo the transcript's work for frames never shown.
   */
  pendingFrame: number | null;
  /** Mirrors the store's activity so a text delta can clear it without reading the store. */
  activity: TurnActivity | null;
  /**
   * Kind of the delta applied last, or null once any other event came in. A
   * delta continues the reply's last part only straight after one of its own
   * kind; after a tool call or a new step it starts a part of its own.
   */
  lastDelta: "text" | "reasoning" | null;
  /** Picked up by `followRunningTurn`, not started by a send here. */
  followed: boolean;
  /**
   * A message this app did not queue joined the transcript mid-run. Only its
   * id is known, so the transcript is read again once the turn ends.
   */
  stale: boolean;
  /** Set while the turn waits for the run that delivers what is still queued; see `linger`. */
  lingering: ReturnType<typeof setTimeout> | null;
}

const liveTurns = new Map<ChatId, LiveTurn>();
/** Chats claimed by a rerun that is still being set up and has no live turn yet. */
const startingTurns = new Set<ChatId>();

function isCurrentTurn(turn: LiveTurn): boolean {
  return !turn.finished && liveTurns.get(turn.chatId) === turn;
}

function settleTurn(turn: LiveTurn): void {
  if (turn.finished) return;
  stopLingering(turn);
  flushDraft(turn);
  turn.finished = true;
  // A form belongs to its run: once the run is over there is nothing left to
  // answer, and no subscription to hear the backend drop it.
  if (!liveTurns.has(turn.chatId)) {
    const messages = useMessagesStore.getState();
    messages.setForms(turn.chatId, []);
    messages.setActivity(turn.chatId, null);
  }
  turn.resolveCompletion();
}

function writeDraft(turn: LiveTurn): void {
  const { draft } = turn;
  useMessagesStore.getState().patchMessage(turn.chatId, draft.id, {
    status: draft.status,
    text: draft.text,
    ...(draft.parts ? { parts: draft.parts } : {}),
  });
}

function scheduleDraftWrite(turn: LiveTurn): void {
  if (turn.pendingFrame !== null) return;
  turn.pendingFrame = requestAnimationFrame(() => {
    turn.pendingFrame = null;
    if (!turn.finished) writeDraft(turn);
  });
}

/**
 * Writes deltas still waiting for a frame. Every other store update of a
 * live turn runs after this, so it lands on the full text and a stale frame
 * cannot overwrite it.
 */
function flushDraft(turn: LiveTurn): void {
  if (turn.pendingFrame === null) return;
  cancelAnimationFrame(turn.pendingFrame);
  turn.pendingFrame = null;
  if (!turn.finished) writeDraft(turn);
}

/**
 * Sends a user message into a chat and streams the reply.
 *
 * Resolves when the turn ends: chat-idle, a fatal error, or a user
 * interrupt. Delivery failures (the prompt POST itself) mark the turn
 * failed immediately — the optimistic messages stay on screen with error
 * status so nothing the user typed is lost.
 *
 * `sentAt` is earlier than now when the chat had to be created first.
 */
export async function sendMessage(
  chatId: ChatId,
  text: string,
  attachments?: Attachment[],
  sentAt = Date.now(),
): Promise<void> {
  await runTurn(
    chatId,
    { id: localId("user"), text, ...(attachments ? { attachments } : {}) },
    {
      deliver: (provider, message) => provider.send(chatId, message),
      sentAt,
    },
  );
}

/** How a turn reaches the backend once its events are subscribed. */
type Deliver = (provider: ChatProvider, message: UserMessage) => Promise<void>;

interface RunTurnOptions {
  deliver: Deliver;
  /** When the user asked for the turn; a rerun asks before it gets the chat ready. */
  sentAt: number;
  /**
   * Runs before the event subscription opens. A rerun uses it to ask the
   * backend to roll the old turn back first: the events the backend emits
   * while doing that bookkeeping must not be read as this turn's own.
   */
  prepare?: Deliver;
  /** Messages this turn replaces on screen (the previous user message + reply). */
  replaceIds?: string[];
  /**
   * Set while the backend holds a rollback for this turn that has not been
   * delivered yet. The marker is persisted so a crash in between cannot leave
   * a rollback armed for the user's next message.
   */
  markRegeneratePending?: boolean;
  /** Undoes `prepare` when the turn never starts. */
  discardPrepared?: (provider: ChatProvider) => Promise<void>;
}

async function runTurn(
  chatId: ChatId,
  userMessage: UserMessage,
  options: RunTurnOptions,
): Promise<void> {
  if (options.prepare) {
    const provider = await getProvider();
    if (!provider) return;
    if (options.markRegeneratePending) {
      useChatsStore.getState().markPendingRegenerate(chatId, userMessage.id);
    }
    try {
      await options.prepare(provider, userMessage);
    } catch (error) {
      await options.discardPrepared?.(provider).catch(() => undefined);
      if (options.markRegeneratePending) {
        useChatsStore.getState().clearPendingRegenerate(chatId);
      }
      useMessagesStore.getState().setTurnError(chatId, describe(error));
      return;
    }
  }

  beginTurn(chatId, userMessage, options.sentAt, options.replaceIds);
  const turn = liveTurns.get(chatId);
  if (!turn) return;

  // Subscribe first so early deltas are not missed, then deliver the prompt.
  const consuming = consumeEvents(turn);
  try {
    const delivery = getProvider().then((provider) => {
      if (!provider) throw new Error(t("errors.notConnected"));
      return options.deliver(provider, userMessage);
    });
    // Some provider event iterators do not promptly close when their signal is
    // aborted. The local completion signal keeps Stop responsive even when the
    // underlying iterator is still winding down.
    await Promise.race([delivery, turn.completion]);
    if (options.markRegeneratePending) {
      // The rerun reached the server: the rollback it carried is committed, so
      // nothing is left armed.
      useChatsStore.getState().clearPendingRegenerate(chatId);
    }
    if (!isCurrentTurn(turn)) return;
  } catch (error) {
    if (options.markRegeneratePending) {
      useChatsStore.getState().clearPendingRegenerate(chatId);
    }
    if (!turn.finished) failTurn(turn, error);
    return;
  }
  await Promise.race([consuming, turn.completion]);
}

function describe(error: unknown): string {
  return error instanceof Error && error.message ? error.message : t("errors.replyFailed");
}

/**
 * Re-runs the last turn of a chat: the user's last message is sent again and
 * its reply is replaced instead of stacked underneath.
 *
 * The screen only offers this for the newest reply, so the target is the last
 * user message in the transcript. When the backend can rerun a turn natively
 * it is asked to drop the old turn first, which keeps the transcript (and the
 * model's context) free of duplicates; otherwise the message is simply
 * re-sent and the previous reply stays where it is.
 */
export async function regenerateReply(chatId: ChatId): Promise<RegenerateOutcome> {
  return startRerun(chatId);
}

/**
 * Replaces one of the chat's user messages with `text` and runs it again;
 * everything after it is dropped, as a rerun drops the old reply. If the
 * server's copy of `message` no longer reads the same (another client wrote
 * since), nothing is sent. Needs the backend's native rerun: re-sending
 * instead would leave the old turns standing above.
 */
export async function editMessage(
  chatId: ChatId,
  message: Message,
  text: string,
): Promise<RegenerateOutcome> {
  return startRerun(chatId, { message, text });
}

interface Edit {
  message: Message;
  text: string;
}

async function startRerun(chatId: ChatId, edit?: Edit): Promise<RegenerateOutcome> {
  // A repeated tap on the same rerun; the first one is already under way.
  if (startingTurns.has(chatId)) return { ok: false };
  if (isTurnLive(chatId)) return { ok: false, error: t("errors.turnLive") };
  // The rerun only goes live once the transcript is fetched and the rollback
  // staged. Until then it holds the chat, so a second tap or a send cannot
  // start a turn beside it and leave this one's reply "Sending" forever.
  startingTurns.add(chatId);
  const sentAt = Date.now();
  const messages = useMessagesStore.getState();
  messages.setTurnActive(chatId, true);
  messages.setActivity(chatId, { kind: "sending", since: sentAt });
  try {
    return await rerun(chatId, sentAt, edit);
  } finally {
    // Once live, the turn itself owns the chat; this only covers not starting.
    if (startingTurns.delete(chatId) && !liveTurns.has(chatId)) {
      useMessagesStore.getState().setTurnActive(chatId, false);
      useMessagesStore.getState().setActivity(chatId, null);
    }
  }
}

async function rerun(chatId: ChatId, sentAt: number, edit?: Edit): Promise<RegenerateOutcome> {
  const provider = await getProvider();
  if (!provider) return { ok: false, error: t("errors.notConnected") };

  // The transcript has to come from the server first: a native rerun
  // addresses the turn by its backend message id, and the ids of a message
  // sent in this session are still local ones.
  // The edited message is found again by its place in the transcript.
  const index = edit ? indexOf(chatId, edit.message) : -1;
  await useMessagesStore.getState().fetchMessages(chatId);
  const messages = useMessagesStore.getState().byChat[chatId] ?? [];

  const target = edit ? turnAt(messages, index) : lastTurn(messages);
  if (edit && target?.user.text !== edit.message.text) {
    return { ok: false, error: t("errors.chatChanged") };
  }
  if (!target) return { ok: false, error: t("errors.nothingToRegenerate") };
  if (!canResendAttachments(target.user.attachments)) {
    return {
      ok: false,
      error: t("errors.attachmentGone"),
    };
  }

  const native = provider.capabilities.regenerate && typeof provider.regenerate === "function";
  if (edit && !native) return { ok: false, error: t("errors.editUnsupported") };
  if (native && target.user.id.startsWith(LOCAL_ID_PREFIX)) {
    return { ok: false, error: t("errors.transcriptUnavailable") };
  }

  const carried: Pick<UserMessage, "text" | "attachments"> = {
    text: edit?.text ?? target.user.text,
    ...(target.user.attachments ? { attachments: target.user.attachments } : {}),
  };
  if (native) {
    // The backend drops the old turn, so the rerun takes its place on screen
    // and keeps the message id it is addressed by.
    await runTurn(
      chatId,
      { id: target.user.id, ...carried },
      {
        prepare: provider.prepareRegenerate
          ? (active, outgoing) => active.prepareRegenerate!(chatId, outgoing)
          : undefined,
        deliver: (active, outgoing) => active.regenerate!(chatId, outgoing),
        discardPrepared: (active) => active.discardRegenerate!(chatId),
        replaceIds: target.replaceIds,
        markRegeneratePending: true,
        sentAt,
      },
    );
  } else {
    // Nothing is rolled back, so the previous turn stays where it is and the
    // rerun is a new one below it.
    await runTurn(
      chatId,
      { id: localId("user"), ...carried },
      {
        deliver: (active, outgoing) => active.send(chatId, outgoing),
        sentAt,
      },
    );
  }
  return { ok: true };
}

interface TurnTarget {
  user: Message;
  replaceIds: string[];
}

function turnAt(messages: Message[], index: number): TurnTarget | null {
  const user = messages[index];
  if (user?.role !== "user") return null;
  return { user, replaceIds: messages.slice(index).map((candidate) => candidate.id) };
}

function indexOf(chatId: ChatId, message: Message): number {
  return (useMessagesStore.getState().byChat[chatId] ?? []).findIndex(
    (candidate) => candidate.id === message.id,
  );
}

function lastTurn(messages: Message[]): TurnTarget | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "user") {
      return {
        user: message,
        replaceIds: messages.slice(index).map((candidate) => candidate.id),
      };
    }
  }
  return null;
}

/**
 * Abandons a rerun that was staged on the server but never delivered (the app
 * was killed in between). Best effort: the marker is cleared either way.
 */
export async function discardPendingRegenerate(chatId: ChatId): Promise<void> {
  const provider = await getProvider().catch(() => null);
  await provider?.discardRegenerate?.(chatId).catch(() => undefined);
  useChatsStore.getState().clearPendingRegenerate(chatId);
}

export type BranchOutcome = { ok: true; chat: ChatSummary } | { ok: false; error: string };

/**
 * Copies the chat into a new one that ends with `reply`. A branch is cut at a
 * backend message id, which a message sent in this session may not have yet,
 * so the transcript is read again and the reply found by its place in it.
 */
export async function branchChat(chatId: ChatId, reply: Message): Promise<BranchOutcome> {
  const ready = await branchingProvider(chatId);
  if (!("provider" in ready)) return ready;
  const index = indexOf(chatId, reply);
  await useMessagesStore.getState().fetchMessages(chatId);
  const transcript = useMessagesStore.getState().byChat[chatId] ?? [];
  if (transcript[index]?.role !== "assistant") {
    return { ok: false, error: t("errors.chatChanged") };
  }
  return branchBefore(ready.provider, chatId, transcript, index + 1);
}

export type EditBranchOutcome =
  { ok: true; chat: ChatSummary; attachments?: Attachment[] } | { ok: false; error: string };

/**
 * Copies the chat into a new one that ends just before `message`, for an edit
 * of it to be sent there instead of replacing what follows it here. Resolves
 * with the attachments the edit carries over, as the server has them.
 */
export async function branchForEdit(chatId: ChatId, message: Message): Promise<EditBranchOutcome> {
  const ready = await branchingProvider(chatId);
  if (!("provider" in ready)) return ready;
  const index = indexOf(chatId, message);
  await useMessagesStore.getState().fetchMessages(chatId);
  const transcript = useMessagesStore.getState().byChat[chatId] ?? [];
  const user = transcript[index];
  if (user?.role !== "user" || user.text !== message.text) {
    return { ok: false, error: t("errors.chatChanged") };
  }
  if (!canResendAttachments(user.attachments)) {
    return { ok: false, error: t("errors.attachmentGone") };
  }
  const outcome = await branchBefore(ready.provider, chatId, transcript, index);
  return outcome.ok && user.attachments ? { ...outcome, attachments: user.attachments } : outcome;
}

async function branchingProvider(
  chatId: ChatId,
): Promise<{ provider: ChatProvider } | { ok: false; error: string }> {
  if (startingTurns.has(chatId) || isTurnLive(chatId)) {
    return { ok: false, error: t("errors.turnLive") };
  }
  const provider = await getProvider();
  if (!provider) return { ok: false, error: t("errors.notConnected") };
  if (!provider.branchChat) return { ok: false, error: t("errors.branchFailed") };
  return { provider };
}

/** A new chat holding the messages of `transcript` before index `cut`. */
async function branchBefore(
  provider: ChatProvider,
  chatId: ChatId,
  transcript: Message[],
  cut: number,
): Promise<BranchOutcome> {
  const before = transcript[cut]?.id;
  if (before?.startsWith(LOCAL_ID_PREFIX)) {
    return { ok: false, error: t("errors.transcriptUnavailable") };
  }
  const chats = useChatsStore.getState();
  let chat: ChatSummary;
  try {
    // Nothing comes before the first message, and a backend has no empty
    // branch to make: a new chat on the same model is what that branch holds.
    const model = chats.chats.find((candidate) => candidate.id === chatId)?.model;
    chat =
      cut === 0
        ? await provider.createChat(model ? { model } : undefined)
        : await provider.branchChat!(chatId, before);
  } catch (error) {
    // Only a connection problem is worth naming: the server's own reasons
    // ("Cannot fork empty session: ses_…") are not worded for the user.
    const known = error instanceof ConnectionError && error.code !== "unknown";
    return { ok: false, error: known ? error.message : t("errors.branchFailed") };
  }
  // Before it is listed: a temporary chat's branch must never reach the sidebar.
  if (chats.temporary[chatId]) chats.markTemporary(chat.id);
  chats.upsert(chat);
  // The new chat opens on what it was copied from instead of a skeleton; its
  // own transcript replaces this once it is read.
  useMessagesStore.getState().setMessages(chat.id, transcript.slice(0, cut));
  return { ok: true, chat };
}

function beginTurn(
  chatId: ChatId,
  userMessage: UserMessage,
  sentAt: number,
  replaceIds: string[] = [],
): void {
  const messages = useMessagesStore.getState();
  const user: Message = {
    id: userMessage.id,
    role: "user",
    text: userMessage.text,
    ...(userMessage.attachments ? { attachments: userMessage.attachments } : {}),
    status: "complete",
    createdAt: Date.now(),
  };
  const assistant: Message = {
    id: localId("assistant"),
    role: "assistant",
    text: "",
    parts: [],
    status: "pending",
    createdAt: Date.now() + 1, // after the user message
  };
  messages.setTurnError(chatId, null);
  // A rerun takes the place of the turn it replaces, so the old turn leaves
  // the screen before the new one lands in it.
  if (replaceIds.length > 0) messages.removeMessages(chatId, replaceIds);
  messages.appendMessage(chatId, user);
  messages.appendMessage(chatId, assistant);
  trackTurn(chatId, assistant, { kind: "sending", since: sentAt });
  useChatsStore.getState().touch(chatId);
}

/** Makes `draft` the chat's live reply; its events stream into it from here on. */
function trackTurn(chatId: ChatId, draft: Message, activity: TurnActivity): LiveTurn {
  let resolveCompletion!: () => void;
  const completion = new Promise<void>((resolve) => {
    resolveCompletion = resolve;
  });
  const turn: LiveTurn = {
    chatId,
    draft,
    controller: new AbortController(),
    paused: false,
    queue: [],
    lastSnapshotText: null,
    completion,
    resolveCompletion,
    finished: false,
    pendingFrame: null,
    activity,
    lastDelta: null,
    followed: false,
    stale: false,
    lingering: null,
  };
  startingTurns.delete(chatId);
  liveTurns.set(chatId, turn);
  const messages = useMessagesStore.getState();
  messages.setTurnActive(chatId, true);
  messages.setActivity(chatId, activity);
  return turn;
}

/**
 * Picks up a run this app instance did not start: one from another client,
 * or its own from before a restart. Call it after the transcript is fetched.
 *
 * Events are live-only, so text written between that fetch and the
 * subscription is missing from the live reply; the transcript is fetched
 * again when the run ends to fill it in.
 */
export async function followRunningTurn(chatId: ChatId): Promise<void> {
  if (isTurnLive(chatId)) return;
  const provider = await getProvider().catch(() => null);
  if (!provider?.isRunning) return;
  const running = await provider.isRunning(chatId).catch(() => false);
  if (!running || isTurnLive(chatId)) return;

  const messages = useMessagesStore.getState();
  const last = (messages.byChat[chatId] ?? []).at(-1);
  let draft: Message;
  if (last?.role === "assistant") {
    // fetchMessages reports an unfinished reply as interrupted; this one runs.
    draft = { ...last, status: "streaming" };
    messages.patchMessage(chatId, draft.id, { status: "streaming" });
  } else {
    draft = {
      id: localId("assistant"),
      role: "assistant",
      text: "",
      parts: [],
      status: "pending",
      createdAt: Date.now(),
    };
    messages.appendMessage(chatId, draft);
  }
  messages.setTurnError(chatId, null);
  // The run is well under way, so it may be between events for a while.
  const turn = trackTurn(chatId, draft, WORKING);
  turn.followed = true;

  await Promise.race([consumeEvents(turn), turn.completion]);
  if (turn.draft.status === "complete" && !isTurnLive(chatId)) {
    await useMessagesStore.getState().fetchMessages(chatId);
  }
}

function nextEvent(
  iterator: AsyncIterator<StreamEvent>,
  signal: AbortSignal,
): Promise<IteratorResult<StreamEvent>> {
  if (signal.aborted) {
    return Promise.resolve({ done: true, value: undefined as never });
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ done: true, value: undefined as never });
    };

    signal.addEventListener("abort", onAbort, { once: true });
    iterator.next().then(
      (result) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      },
      (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      },
    );
  });
}

function closeEventIterator(iterator?: AsyncIterator<StreamEvent>): void {
  if (!iterator?.return) return;
  try {
    const result = iterator.return();
    if (result && typeof result.then === "function") {
      void result.catch(() => undefined);
    }
  } catch {
    // The turn has already been settled locally; iterator cleanup is best effort.
  }
}

async function consumeEvents(turn: LiveTurn): Promise<void> {
  const { controller, chatId } = turn;
  let backoffMs = INITIAL_BACKOFF_MS;
  let resubscribed = false;
  try {
    while (!controller.signal.aborted && !turn.finished) {
      const provider = await getProvider();
      if (!provider) {
        failTurn(turn, new Error(t("errors.notConnected")));
        return;
      }
      let lastActivity = Date.now();
      // The watchdog aborts the subscription on silence; the turn-level
      // controller (user interrupt) aborts everything.
      const subscription = new AbortController();
      const onTurnAbort = () => subscription.abort();
      controller.signal.addEventListener("abort", onTurnAbort, { once: true });
      const watchdog = setInterval(() => {
        if (Date.now() - lastActivity >= STALL_MS) subscription.abort();
      }, WATCHDOG_TICK_MS);
      let streamDied = false;
      let iterator: AsyncIterator<StreamEvent> | undefined;
      try {
        iterator = provider.events(chatId, subscription.signal)[Symbol.asyncIterator]();
        void syncForms(provider, chatId);
        // Not on a send's first subscription: the backend can list the turn's
        // own prompt there, just before delivering it.
        if (resubscribed || turn.followed) void syncQueue(chatId, provider);
        resubscribed = true;
        while (!turn.finished) {
          const next = await nextEvent(iterator, subscription.signal);
          if (next.done) break;
          const event = next.value;
          lastActivity = Date.now();
          if (event.type === "form") {
            useMessagesStore.getState().addForm(chatId, event.form);
            continue;
          }
          if (event.type === "form-closed") {
            useMessagesStore.getState().removeForm(chatId, event.formId);
            continue;
          }
          // Kept out of `applyEvent`: totals can arrive between two deltas of
          // one sentence, and anything applied there ends the part being written.
          if (event.type === "chat-usage") {
            useChatsStore.getState().setUsage(chatId, event);
            continue;
          }
          if (event.type === "queued-cancelled") {
            changeQueue(chatId, (messages) => messages.removeQueued(chatId, event.id));
            continue;
          }
          if (event.type === "queued-delivery") {
            changeQueue(chatId, (messages) =>
              messages.patchQueued(chatId, event.id, { delivery: event.delivery }),
            );
            continue;
          }
          if (event.type === "connected") {
            // A followed run can end between the check that it runs and this
            // subscription, and its closing events are then gone for good.
            // A send subscribes before its prompt goes out, so it is exempt.
            if (turn.followed && !(await stillRunning(provider, chatId))) {
              await reconcile(turn, { over: true });
              if (turnEnded(turn)) {
                endTurn(turn);
                return;
              }
            }
            continue;
          }
          applyEvent(turn, event);
          if (isRetryableError(event)) {
            streamDied = true;
            break;
          }
          if (turnEnded(turn)) {
            endTurn(turn);
            return;
          }
          backoffMs = INITIAL_BACKOFF_MS; // healthy traffic resets the backoff
        }
      } finally {
        clearInterval(watchdog);
        controller.signal.removeEventListener("abort", onTurnAbort);
        closeEventIterator(iterator);
      }
      if (controller.signal.aborted) return;
      if (turnEnded(turn)) {
        endTurn(turn);
        return;
      }

      // The stream ended while the turn is live: a transport drop (the
      // adapter surfaces it as a retryable error), a server-side close, or
      // the stall watchdog. Reconcile from server truth, then resubscribe.
      if (!streamDied) await sleep(1_000, controller.signal);
      await reconcile(turn);
      if (controller.signal.aborted) return;
      if (turnEnded(turn)) {
        endTurn(turn);
        return;
      }
      await sleep(backoffMs, controller.signal);
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    }
  } catch (error) {
    if (!controller.signal.aborted) failTurn(turn, error);
  }
}

function isRetryableError(event: StreamEvent): boolean {
  return event.type === "error" && event.retryable;
}

function turnEnded(turn: LiveTurn): boolean {
  return (
    turn.lingering === null && turn.draft.status !== "pending" && turn.draft.status !== "streaming"
  );
}

/**
 * Keeps a turn live after its run ended with messages still queued. The
 * backend delivers them in a run of its own, and on this subscription that
 * run reads as more of this turn; ending here would close the subscription
 * just before it starts. Without a delivery in time, the turn ends after all.
 */
function linger(turn: LiveTurn): void {
  turn.lingering = setTimeout(() => {
    turn.lingering = null;
    if (!isCurrentTurn(turn)) return;
    turn.controller.abort();
    endTurn(turn);
  }, LINGER_MS);
}

function stopLingering(turn: LiveTurn): void {
  if (turn.lingering === null) return;
  clearTimeout(turn.lingering);
  turn.lingering = null;
}

/** Natural completion (the stream itself ended the turn). */
function endTurn(turn: LiveTurn): void {
  if (turn.finished) return;
  if (liveTurns.get(turn.chatId) === turn) {
    liveTurns.delete(turn.chatId);
    useMessagesStore.getState().setTurnActive(turn.chatId, false);
  }
  settleTurn(turn);
  const queued = useMessagesStore.getState().queued[turn.chatId] ?? [];
  if (turn.stale || queued.length > 0) void resumeQueue(turn.chatId);
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * Replaces the chat's forms with the backend's list. The event stream is
 * live-only, so this is how forms raised or closed during a gap catch up.
 */
export async function syncForms(provider: ChatProvider, chatId: ChatId): Promise<void> {
  if (!provider.pendingForms) return;
  try {
    const forms = await provider.pendingForms(chatId);
    // Forms are cleared when the turn ends; a late reply must not bring them back.
    if (liveTurns.has(chatId)) useMessagesStore.getState().setForms(chatId, forms);
  } catch {
    // The forms on screen stay; the next resubscribe syncs again.
  }
}

/**
 * Settles a form from the card. On failure the form list is re-synced: the
 * usual cause is a form the backend already closed, which then disappears.
 * `result` is what the card showed and the user picked; it is kept only for
 * a form the backend's transcript will not record.
 */
async function settleForm(
  chatId: ChatId,
  form: ChatForm,
  result: FormResult,
  settle: (provider: ChatProvider) => Promise<void> | undefined,
): Promise<void> {
  const provider = await getProvider();
  if (!provider) throw new Error(t("errors.notConnected"));
  try {
    await settle(provider);
  } catch (error) {
    void syncForms(provider, chatId);
    throw error;
  }
  useMessagesStore.getState().removeForm(chatId, form.id);
  if (!form.toolId) keepFormResult(chatId, result);
}

export function answerForm(
  chatId: ChatId,
  form: ChatForm,
  answer: FormAnswer,
  result: FormResult,
): Promise<void> {
  return settleForm(chatId, form, result, (provider) =>
    provider.answerForm?.(chatId, form.id, answer),
  );
}

export function dismissForm(chatId: ChatId, form: ChatForm, result: FormResult): Promise<void> {
  return settleForm(chatId, form, result, (provider) => provider.dismissForm?.(chatId, form.id));
}

/**
 * Puts a settled form into the live reply. It is saved as a record when a
 * tool call can anchor it, which a form raised mid-run has: the call that
 * asked is still running. Without one it lasts until the transcript is next
 * fetched.
 */
function keepFormResult(chatId: ChatId, form: FormResult): void {
  const turn = liveTurns.get(chatId);
  if (!turn || form.questions.length === 0) return;
  flushDraft(turn);
  const parts = turn.draft.parts ?? [];
  const anchor = runningTool(turn.draft) ?? parts.findLast((part) => part.type === "tool")?.tool;
  if (anchor) {
    const record = { afterToolId: anchor.id, form };
    useMessagesStore.getState().addFormRecord(chatId, record);
    turn.draft = withFormRecords([turn.draft], [record])[0];
  } else {
    turn.draft = { ...turn.draft, parts: [...parts, { type: "form", form }] };
  }
  writeDraft(turn);
}

function applyEvent(turn: LiveTurn, event: StreamEvent): void {
  if (turn.finished) return;
  if (turn.paused) {
    turn.queue.push(event);
    return;
  }
  if (event.type === "text-delta" || event.type === "reasoning-delta") {
    const kind = event.type === "text-delta" ? "text" : "reasoning";
    // Covers a missed activity event, e.g. when the text or reasoning started during a reconnect.
    if (kind === "text" && turn.activity) setActivity(turn, null);
    if (kind === "reasoning" && turn.activity?.kind !== "thinking") setActivity(turn, THINKING);
    turn.draft = appendDelta(turn.draft, kind, event.text, turn.lastDelta === kind);
    turn.lastDelta = kind;
    scheduleDraftWrite(turn);
    return;
  }
  flushDraft(turn);
  turn.lastDelta = null;
  const messages = useMessagesStore.getState();
  switch (event.type) {
    case "activity":
      setActivity(turn, event.activity);
      break;
    case "tool":
    case "form-result": {
      turn.draft =
        event.type === "tool"
          ? updateTool(turn.draft, event.id, event.update)
          : updateFormResult(turn.draft, event.id, event.update);
      writeDraft(turn);
      // With calls running side by side, the latest one still going is shown.
      const running = runningTool(turn.draft);
      setActivity(
        turn,
        running ? { kind: "tool", category: running.category, name: running.name } : WORKING,
      );
      break;
    }
    case "message-complete": {
      const { draft } = turn;
      // Usage counted without its time would make the reply look faster than
      // it was, so one round-trip of unknown length leaves the whole unknown.
      const timed = draft.usage === undefined || draft.generationMs !== undefined;
      const counted: Partial<Message> = {
        usage: addUsage(draft.usage, event.usage),
        requests: event.usage ? (draft.requests ?? 0) + 1 : draft.requests,
        cost: addCost(draft.cost, event.cost),
        contextTokens: event.usage ? totalTokens(event.usage) : draft.contextTokens,
        generationMs:
          timed && event.generationMs !== undefined
            ? (draft.generationMs ?? 0) + event.generationMs
            : undefined,
        model: event.model ?? draft.model,
      };
      turn.draft = { ...draft, ...counted };
      messages.patchMessage(turn.chatId, draft.id, counted);
      break;
    }
    case "queued-delivered":
      deliverQueued(turn, event.id);
      break;
    case "chat-idle": {
      // The whole prompt run finished. An assistant message that never
      // produced visible text failed silently — surface it as an error with a
      // reason instead of leaving the user on a blank, unexplained bubble.
      const produced = hasContent(turn.draft);
      turn.draft = {
        ...turn.draft,
        status: produced ? "complete" : "error",
        completedAt: Date.now(),
      };
      messages.patchMessage(turn.chatId, turn.draft.id, {
        status: turn.draft.status,
        completedAt: turn.draft.completedAt,
      });
      if (!produced) {
        messages.setTurnError(turn.chatId, t("errors.server.noReply"));
      } else if ((messages.queued[turn.chatId] ?? []).length > 0) {
        linger(turn);
      }
      break;
    }
    case "error":
      // Fatal only; retryable errors are handled by the reconnect loop.
      if (!event.retryable) {
        turn.draft = { ...turn.draft, status: "error" };
        messages.patchMessage(turn.chatId, turn.draft.id, { status: "error" });
        messages.setTurnError(turn.chatId, event.message);
      }
      break;
  }
}

const WORKING: TurnActivity = { kind: "working" };
const THINKING: TurnActivity = { kind: "thinking" };

function hasContent(reply: Message): boolean {
  return reply.text.length > 0 || (reply.parts ?? []).length > 0;
}

/**
 * A queued message joined the transcript in the middle of the run: the reply
 * so far is over, and what the run writes next answers the message.
 */
function deliverQueued(turn: LiveTurn, id: string): void {
  const { chatId } = turn;
  stopLingering(turn);
  const messages = useMessagesStore.getState();
  const queued = messages.queued[chatId]?.find((message) => message.id === id);
  if (queued) changeQueue(chatId, (store) => store.removeQueued(chatId, id));
  // Already in place when a reconcile read the transcript after the delivery.
  if ((messages.byChat[chatId] ?? []).some((message) => message.id === id)) return;
  if (!queued) {
    // The turn's own prompt is delivered this way too, before its reply starts.
    if (hasContent(turn.draft)) turn.stale = true;
    return;
  }
  const now = Date.now();
  const { draft } = turn;
  if (hasContent(draft)) {
    // Already complete when its run ended and the backend started another
    // to deliver this message.
    if (draft.status !== "complete") {
      turn.draft = { ...draft, status: "complete", completedAt: now };
      messages.patchMessage(chatId, draft.id, { status: "complete", completedAt: now });
    }
  } else {
    // Messages steered in together are delivered one after the other, before
    // the reply to the first of them has begun.
    messages.removeMessage(chatId, draft.id);
  }
  messages.appendMessage(chatId, {
    id,
    role: "user",
    text: queued.text,
    ...(queued.attachments ? { attachments: queued.attachments } : {}),
    status: "complete",
    createdAt: now,
  });
  const reply: Message = {
    id: localId("assistant"),
    role: "assistant",
    text: "",
    parts: [],
    status: "pending",
    createdAt: now + 1,
  };
  messages.appendMessage(chatId, reply);
  turn.draft = reply;
  turn.lastSnapshotText = null;
  setActivity(turn, WORKING);
}

function appendDelta(
  draft: Message,
  kind: "text" | "reasoning",
  delta: string,
  continues: boolean,
): Message {
  const parts = draft.parts ?? [];
  const last = parts.at(-1);
  const nextParts: ReplyPart[] =
    continues && last?.type === kind
      ? [...parts.slice(0, -1), { type: kind, text: last.text + delta }]
      : [...parts, { type: kind, text: delta }];
  if (kind === "reasoning") return { ...draft, status: "streaming", parts: nextParts };
  // `text` joins the text parts, so a new one starts after a blank line.
  const joiner = continues || draft.text.length === 0 ? "" : "\n\n";
  return { ...draft, status: "streaming", parts: nextParts, text: draft.text + joiner + delta };
}

/** A call is one part, shown as a tool until it turns out to have asked a form. */
function callIndex(parts: ReplyPart[], id: string): number {
  return parts.findIndex(
    (part) =>
      (part.type === "tool" && part.tool.id === id) ||
      (part.type === "form" && part.form.id === id),
  );
}

function updateTool(draft: Message, id: string, update: Partial<Omit<ToolCall, "id">>): Message {
  const parts = draft.parts ?? [];
  const index = callIndex(parts, id);
  const current = index >= 0 ? parts[index] : undefined;
  // A call's first event can be lost to a reconnect; later ones still add it.
  const tool: ToolCall = {
    ...(current?.type === "tool"
      ? current.tool
      : { id, name: "", category: "other", subject: "", status: "running" }),
    ...update,
  };
  const nextParts: ReplyPart[] =
    index >= 0
      ? parts.map((part, at) => (at === index ? { type: "tool", tool } : part))
      : [...parts, { type: "tool", tool }];
  return { ...draft, status: "streaming", parts: nextParts };
}

const TOOL_STATUS = { waiting: "running", answered: "done", dismissed: "failed" } as const;

function updateFormResult(
  draft: Message,
  id: string,
  update: Partial<Omit<FormResult, "id">>,
): Message {
  const parts = draft.parts ?? [];
  const index = callIndex(parts, id);
  const current = index >= 0 ? parts[index] : undefined;
  // The event with the questions can be lost to a reconnect. With nothing to
  // show as a form, the call stays the tool it was.
  if (current?.type !== "form" && !update.questions) {
    return update.status ? updateTool(draft, id, { status: TOOL_STATUS[update.status] }) : draft;
  }
  const form: FormResult = {
    ...(current?.type === "form"
      ? current.form
      : { id, status: "waiting", questions: [], answers: [] }),
    ...update,
  };
  const nextParts: ReplyPart[] =
    index >= 0
      ? parts.map((part, at) => (at === index ? { type: "form", form } : part))
      : [...parts, { type: "form", form }];
  return { ...draft, status: "streaming", parts: nextParts };
}

function runningTool(draft: Message): ToolCall | undefined {
  for (const part of [...(draft.parts ?? [])].reverse()) {
    if (part.type === "tool" && part.tool.status === "running") return part.tool;
  }
  return undefined;
}

function setActivity(turn: LiveTurn, activity: TurnActivity | null): void {
  turn.activity = activity;
  useMessagesStore.getState().setActivity(turn.chatId, activity);
}

/**
 * Replaces the optimistic transcript with server truth.
 *
 * The transcript from the server is adopted wholesale (its ids win); the
 * live draft continues under the server-confirmed assistant id. If the
 * adopted message is unchanged across two consecutive snapshots and the
 * adapter maps it to a terminal status, the turn's closing events were
 * lost in a gap — finish the turn with that status instead of waiting
 * forever. `over` says the backend already reported the run finished, so
 * one snapshot is enough.
 */
async function reconcile(turn: LiveTurn, { over = false } = {}): Promise<void> {
  flushDraft(turn);
  turn.paused = true;
  try {
    const provider = await getProvider();
    if (!provider) return;
    const server = await provider.fetchMessages(turn.chatId);
    if (turn.finished || turn.controller.signal.aborted) return;
    const messages = useMessagesStore.getState();
    const fetched = withFormRecords(server, messages.formRecords[turn.chatId]);
    const lastAssistant = [...fetched].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) {
      messages.setMessages(turn.chatId, fetched);
      return;
    }
    const previousSnapshot = turn.lastSnapshotText;
    turn.lastSnapshotText = lastAssistant.text;
    if (lastAssistant.status === "error") {
      // The server already failed this run while we were disconnected. Adopt
      // it as terminal — retrying here would loop on the same failure.
      turn.draft = lastAssistant;
      messages.setMessages(turn.chatId, fetched);
      if (!messages.turnErrors[turn.chatId]) {
        messages.setTurnError(turn.chatId, t("errors.server.error"));
      }
      endTurn(turn);
      return;
    }
    if (
      over ||
      (previousSnapshot !== null &&
        lastAssistant.text === previousSnapshot &&
        // A tool can run for minutes without a word, so an unchanged reply
        // alone does not mean the run is over.
        !(await stillRunning(provider, turn.chatId)))
    ) {
      if (turn.finished || turn.controller.signal.aborted) return;
      // The run is over, as the backend said or as two agreeing snapshots
      // show: it ended while no stream was listening. Adopt its ending.
      turn.draft = lastAssistant;
      messages.setMessages(turn.chatId, fetched);
      endTurn(turn);
      return;
    }
    if (turn.finished || turn.controller.signal.aborted) return;
    turn.draft = { ...lastAssistant, status: "streaming" };
    // The draft carries the streaming status the raw server copy lacks.
    messages.setMessages(turn.chatId, [
      ...fetched.filter((m) => m.id !== turn.draft.id),
      turn.draft,
    ]);
  } catch {
    // Reconcile fetch failed; the retry loop tries again after backoff.
  } finally {
    turn.paused = false;
    const queued = turn.queue;
    turn.queue = [];
    for (const event of queued) {
      if (turn.finished) break;
      applyEvent(turn, event);
    }
  }
}

/** Backends that can't tell are assumed done; a failed check assumes the run goes on. */
function stillRunning(provider: ChatProvider, chatId: ChatId): Promise<boolean> {
  if (!provider.isRunning) return Promise.resolve(false);
  return provider.isRunning(chatId).catch(() => true);
}

export async function compactChat(chatId: ChatId): Promise<void> {
  const provider = await getProvider();
  if (!provider?.compact) throw new Error(t("errors.notConnected"));
  await provider.compact(chatId);
  await followRunningTurn(chatId);
  // A quick compaction can be over before it is followed, which leaves the
  // transcript still counting the context it replaced.
  if (!isTurnLive(chatId)) await useMessagesStore.getState().fetchMessages(chatId);
}

/**
 * User-initiated interrupt: stop consuming, mark the optimistic message,
 * and tell the server. The server's own interrupted confirmation is not
 * awaited — local state already reflects the user's intent.
 */
export async function interruptTurn(chatId: ChatId): Promise<void> {
  const turn = liveTurns.get(chatId);
  if (!turn) return;
  flushDraft(turn);
  turn.controller.abort();
  if (liveTurns.get(chatId) === turn) liveTurns.delete(chatId);
  const messages = useMessagesStore.getState();
  if (
    turn.draft.status === "pending" &&
    turn.draft.text.length === 0 &&
    (turn.draft.parts ?? []).length === 0
  ) {
    messages.removeMessage(chatId, turn.draft.id);
  } else {
    messages.patchMessage(chatId, turn.draft.id, {
      status: "interrupted",
      completedAt: Date.now(),
    });
  }
  if (!isTurnLive(chatId)) messages.setTurnActive(chatId, false);
  settleTurn(turn);
  try {
    const provider = await getProvider();
    await provider?.interrupt(chatId);
  } catch {
    // Surface on the next turn if the server truly missed it.
  }
}

function failTurn(turn: LiveTurn, error: unknown): void {
  if (turn.finished) return;
  flushDraft(turn);
  turn.controller.abort(); // stop the consume loop, if still running
  const isCurrent = liveTurns.get(turn.chatId) === turn;
  if (isCurrent) liveTurns.delete(turn.chatId);
  const messages = useMessagesStore.getState();
  const message = error instanceof Error && error.message ? error.message : t("errors.replyFailed");
  if (isCurrent) {
    messages.patchMessage(turn.chatId, turn.draft.id, { status: "error" });
    messages.setTurnError(turn.chatId, message);
    messages.setTurnActive(turn.chatId, false);
    useChatsStore.getState().touch(turn.chatId);
  }
  settleTurn(turn);
}

/**
 * Bumped on every change to a chat's queue, so that a list read from the
 * backend before the change does not overwrite it.
 */
const queueVersions = new Map<ChatId, number>();
/** Queued here, with the request that queues them still on its way. */
const queueing = new Set<string>();

function changeQueue(
  chatId: ChatId,
  change: (messages: ReturnType<typeof useMessagesStore.getState>) => void,
): void {
  queueVersions.set(chatId, (queueVersions.get(chatId) ?? 0) + 1);
  change(useMessagesStore.getState());
}

/**
 * Replaces the chat's queue with the backend's. Events are live-only, so this
 * is how messages queued, delivered or cancelled during a gap catch up.
 */
export async function syncQueue(chatId: ChatId, provider?: ChatProvider | null): Promise<void> {
  provider ??= await getProvider().catch(() => null);
  if (!provider?.queuedMessages) return;
  const version = queueVersions.get(chatId) ?? 0;
  try {
    const listed = await provider.queuedMessages(chatId);
    if ((queueVersions.get(chatId) ?? 0) !== version) return;
    const messages = useMessagesStore.getState();
    // The backend may answer before it has seen a message still on its way.
    const arriving = (messages.queued[chatId] ?? []).filter(
      (message) => queueing.has(message.id) && !listed.some((item) => item.id === message.id),
    );
    messages.setQueued(chatId, [...listed, ...arriving]);
    dropDelivered(chatId);
  } catch {
    // The queue on screen stays; the next subscription syncs again.
  }
}

/**
 * Sends a message while a reply runs. It waits on the backend and joins the
 * transcript once the reply is done, or as soon as its step ends if steered.
 */
export async function queueMessage(
  chatId: ChatId,
  text: string,
  attachments?: Attachment[],
): Promise<void> {
  const provider = await getProvider();
  if (!provider) throw new Error(t("errors.notConnected"));
  if (!provider.queueMessage || !provider.newMessageId) throw new Error(t("errors.turnLive"));
  const message: QueuedMessage = {
    id: provider.newMessageId(),
    text,
    ...(attachments?.length ? { attachments } : {}),
    delivery: "queue",
    createdAt: Date.now(),
  };
  changeQueue(chatId, (messages) => messages.addQueued(chatId, message));
  queueing.add(message.id);
  try {
    await provider.queueMessage(chatId, message, "queue");
  } catch (error) {
    changeQueue(chatId, (messages) => messages.removeQueued(chatId, message.id));
    throw error;
  } finally {
    queueing.delete(message.id);
  }
  // The reply ended while the message was on its way; the backend starts a
  // run for it that nothing here is following yet.
  if (!isTurnLive(chatId)) void resumeQueue(chatId);
}

/**
 * Delivers a queued message as soon as the reply's current step ends. With no
 * reply running (it was stopped), the message starts one, as a send does.
 */
export async function sendQueuedNow(chatId: ChatId, id: string): Promise<void> {
  const queued = useMessagesStore.getState().queued[chatId]?.find((message) => message.id === id);
  if (!queued) return;
  const provider = await getProvider();
  if (!provider?.steerQueued) throw new Error(t("errors.notConnected"));
  if (isTurnLive(chatId)) {
    if (queued.delivery === "steer") return;
    changeQueue(chatId, (messages) => messages.patchQueued(chatId, id, { delivery: "steer" }));
    try {
      await provider.steerQueued(chatId, id);
    } catch (error) {
      changeQueue(chatId, (messages) => messages.patchQueued(chatId, id, { delivery: "queue" }));
      throw error;
    }
    return;
  }
  changeQueue(chatId, (messages) => messages.removeQueued(chatId, id));
  await runTurn(
    chatId,
    { id, text: queued.text, ...(queued.attachments ? { attachments: queued.attachments } : {}) },
    { deliver: (active) => active.steerQueued!(chatId, id), sentAt: Date.now() },
  );
}

/**
 * Takes a queued message back. It stays queued until the backend agrees: one
 * delivered in the meantime has to land in the transcript, not vanish.
 */
export async function cancelQueuedMessage(chatId: ChatId, id: string): Promise<QueuedMessage> {
  const queued = useMessagesStore.getState().queued[chatId]?.find((message) => message.id === id);
  const provider = await getProvider();
  if (!queued || !provider?.cancelQueued) throw new Error(t("errors.notConnected"));
  try {
    await provider.cancelQueued(chatId, id);
  } catch (error) {
    void syncQueue(chatId, provider);
    throw error;
  }
  changeQueue(chatId, (messages) => messages.removeQueued(chatId, id));
  return queued;
}

/**
 * Catches up after a turn that left messages queued, or that saw a message it
 * did not queue: the backend delivers what is still queued in a run of its
 * own, and that run is followed like one another client started.
 */
async function resumeQueue(chatId: ChatId): Promise<void> {
  if (isTurnLive(chatId)) return;
  await useMessagesStore.getState().fetchMessages(chatId);
  dropDelivered(chatId);
  await syncQueue(chatId);
  // Even with the queue empty: its last message may have been delivered
  // already, into a run that is still writing the reply to it.
  await followRunningTurn(chatId);
}

/**
 * Drops queued messages the transcript already holds: delivered while no
 * subscription was there to hear it.
 */
function dropDelivered(chatId: ChatId): void {
  const messages = useMessagesStore.getState();
  const queued = messages.queued[chatId] ?? [];
  const transcript = new Set((messages.byChat[chatId] ?? []).map((message) => message.id));
  const left = queued.filter((message) => !transcript.has(message.id));
  if (left.length < queued.length) changeQueue(chatId, (store) => store.setQueued(chatId, left));
}

export function isTurnLive(chatId: ChatId): boolean {
  return liveTurns.has(chatId) || startingTurns.has(chatId);
}

/**
 * Cold-open cleanup: a fetched transcript can contain an in-progress
 * assistant message from a run this app instance is not streaming (the
 * previous session died mid-turn). Nothing will ever stream into it
 * again — mark it interrupted.
 */
export function settleOrphanedStreams(chatId: ChatId): void {
  if (isTurnLive(chatId)) return;
  const messages = useMessagesStore.getState();
  for (const message of messages.byChat[chatId] ?? []) {
    if (message.role === "assistant" && message.status === "streaming") {
      messages.patchMessage(chatId, message.id, { status: "interrupted" });
    }
  }
}
