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
 * two consecutive reconciles that see an unchanged, server-terminal
 * message end the turn (its closing events were lost to a gap).
 *
 * Reconnection is for *transport* loss only. Errors the server reports about
 * the run itself (provider auth, rejected model, aborted message) are
 * terminal: the same prompt will fail the same way, so retrying them in a
 * loop would spin forever and hide the reason from the user. Every terminal
 * path resolves the turn's completion signal, which keeps `sendMessage`
 * responsive even when a provider iterator ignores its abort signal.
 */

import type { Attachment, ChatId, Message, StreamEvent, UserMessage } from "@/src/domain";
import { getProvider } from "@/src/lib/providerFactory";
import { canResendAttachments } from "@/src/lib/attachments";
import type { ChatProvider } from "@/src/providers/types";
import { useChatsStore } from "@/src/stores/chats";
import { useMessagesStore } from "@/src/stores/messages";

const INITIAL_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 15_000;
/** Stream silence longer than this triggers a reconcile. */
const STALL_MS = 45_000;
const WATCHDOG_TICK_MS = 5_000;

/** Local id for optimistic messages; server-assigned ids arrive later. */
function localId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
   * Frame that will copy `draft`'s text and reasoning to the store, or null
   * when the store is current. Deltas can arrive many per frame; rendering
   * each one would redo the transcript's work for frames never shown.
   */
  pendingFrame: number | null;
}

const liveTurns = new Map<ChatId, LiveTurn>();

function isCurrentTurn(turn: LiveTurn): boolean {
  return !turn.finished && liveTurns.get(turn.chatId) === turn;
}

function settleTurn(turn: LiveTurn): void {
  if (turn.finished) return;
  flushDraft(turn);
  turn.finished = true;
  turn.resolveCompletion();
}

function writeDraft(turn: LiveTurn): void {
  const { draft } = turn;
  useMessagesStore.getState().patchMessage(turn.chatId, draft.id, {
    status: draft.status,
    text: draft.text,
    ...(draft.reasoning !== undefined ? { reasoning: draft.reasoning } : {}),
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
 */
export async function sendMessage(
  chatId: ChatId,
  text: string,
  attachments?: Attachment[],
): Promise<void> {
  await runTurn(
    chatId,
    { id: localId("user"), text, ...(attachments ? { attachments } : {}) },
    {
      deliver: (provider, message) => provider.send(chatId, message),
    },
  );
}

/** How a turn reaches the backend once its events are subscribed. */
type Deliver = (provider: ChatProvider, message: UserMessage) => Promise<void>;

interface RunTurnOptions {
  deliver: Deliver;
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

  beginTurn(chatId, userMessage, options.replaceIds);
  const turn = liveTurns.get(chatId);
  if (!turn) return;

  // Subscribe first so early deltas are not missed, then deliver the prompt.
  const consuming = consumeEvents(turn);
  try {
    const delivery = getProvider().then((provider) => {
      if (!provider) throw new Error("Not connected. Open Settings to connect.");
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
  return error instanceof Error && error.message ? error.message : "The reply failed.";
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
  if (isTurnLive(chatId)) return { ok: false, error: "Wait for the current reply to finish." };
  const provider = await getProvider();
  if (!provider) return { ok: false, error: "Not connected. Open Settings to connect." };

  // The transcript has to come from the server first: a native rerun
  // addresses the turn by its backend message id, and the ids of a message
  // sent in this session are still local ones.
  const store = useMessagesStore.getState();
  await store.fetchMessages(chatId);
  if (isTurnLive(chatId)) return { ok: false, error: "Wait for the current reply to finish." };

  const target = lastTurn(useMessagesStore.getState().byChat[chatId] ?? []);
  if (!target) return { ok: false, error: "There is nothing to regenerate yet." };
  if (!canResendAttachments(target.user.attachments)) {
    return {
      ok: false,
      error: "The attached file is no longer available. Re-attach it and try again.",
    };
  }

  const native = provider.capabilities.regenerate && typeof provider.regenerate === "function";
  if (native && !target.user.id.startsWith(MESSAGE_ID_PREFIX)) {
    return { ok: false, error: "The server transcript is not available yet. Try again." };
  }

  const carried: Pick<UserMessage, "text" | "attachments"> = {
    text: target.user.text,
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
      },
    );
  }
  return { ok: true };
}

/** Backend message ids are prefixed; locally generated ones are not. */
const MESSAGE_ID_PREFIX = "msg_";

interface TurnTarget {
  user: Message;
  replaceIds: string[];
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

function beginTurn(chatId: ChatId, userMessage: UserMessage, replaceIds: string[] = []): void {
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
    status: "pending",
    createdAt: Date.now() + 1, // after the user message
  };
  messages.setTurnError(chatId, null);
  messages.setTurnActive(chatId, true);
  // A rerun takes the place of the turn it replaces, so the old turn leaves
  // the screen before the new one lands in it.
  if (replaceIds.length > 0) messages.removeMessages(chatId, replaceIds);
  messages.appendMessage(chatId, user);
  messages.appendMessage(chatId, assistant);
  let resolveCompletion!: () => void;
  const completion = new Promise<void>((resolve) => {
    resolveCompletion = resolve;
  });
  liveTurns.set(chatId, {
    chatId,
    draft: assistant,
    controller: new AbortController(),
    paused: false,
    queue: [],
    lastSnapshotText: null,
    completion,
    resolveCompletion,
    finished: false,
    pendingFrame: null,
  });
  useChatsStore.getState().touch(chatId);
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
  try {
    while (!controller.signal.aborted && !turn.finished) {
      const provider = await getProvider();
      if (!provider) {
        failTurn(turn, new Error("Not connected. Open Settings to connect."));
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
        while (!turn.finished) {
          const next = await nextEvent(iterator, subscription.signal);
          if (next.done) break;
          const event = next.value;
          lastActivity = Date.now();
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
  return turn.draft.status !== "pending" && turn.draft.status !== "streaming";
}

/** Natural completion (the stream itself ended the turn). */
function endTurn(turn: LiveTurn): void {
  if (turn.finished) return;
  if (liveTurns.get(turn.chatId) === turn) {
    liveTurns.delete(turn.chatId);
    useMessagesStore.getState().setTurnActive(turn.chatId, false);
  }
  settleTurn(turn);
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

function applyEvent(turn: LiveTurn, event: StreamEvent): void {
  if (turn.finished) return;
  if (turn.paused) {
    turn.queue.push(event);
    return;
  }
  if (event.type === "text-delta") {
    turn.draft = { ...turn.draft, status: "streaming", text: turn.draft.text + event.text };
    scheduleDraftWrite(turn);
    return;
  }
  if (event.type === "reasoning-delta") {
    turn.draft = {
      ...turn.draft,
      status: "streaming",
      reasoning: (turn.draft.reasoning ?? "") + event.text,
    };
    scheduleDraftWrite(turn);
    return;
  }
  flushDraft(turn);
  const messages = useMessagesStore.getState();
  switch (event.type) {
    case "message-complete":
      // Step-level completion; usage is final for the step so far.
      turn.draft = { ...turn.draft, ...(event.usage ? { usage: event.usage } : {}) };
      messages.patchMessage(turn.chatId, turn.draft.id, {
        ...(event.usage ? { usage: event.usage } : {}),
      });
      break;
    case "chat-idle": {
      // The whole prompt run finished. An assistant message that never
      // produced visible text failed silently — surface it as an error with a
      // reason instead of leaving the user on a blank, unexplained bubble.
      const produced = turn.draft.text.length > 0 || Boolean(turn.draft.reasoning);
      turn.draft = { ...turn.draft, status: produced ? "complete" : "error" };
      messages.patchMessage(turn.chatId, turn.draft.id, { status: turn.draft.status });
      if (!produced) {
        messages.setTurnError(
          turn.chatId,
          "The server finished the run without returning a reply. It may have rejected the model or provider request.",
        );
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

/**
 * Replaces the optimistic transcript with server truth.
 *
 * The transcript from the server is adopted wholesale (its ids win); the
 * live draft continues under the server-confirmed assistant id. If the
 * adopted message is unchanged across two consecutive snapshots and the
 * adapter maps it to a terminal status, the turn's closing events were
 * lost in a gap — finish the turn with that status instead of waiting
 * forever.
 */
async function reconcile(turn: LiveTurn): Promise<void> {
  flushDraft(turn);
  turn.paused = true;
  try {
    const provider = await getProvider();
    if (!provider) return;
    const fetched = await provider.fetchMessages(turn.chatId);
    if (turn.finished || turn.controller.signal.aborted) return;
    const messages = useMessagesStore.getState();
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
        messages.setTurnError(turn.chatId, "The server reported an error.");
      }
      endTurn(turn);
      return;
    }
    if (previousSnapshot !== null && lastAssistant.text === previousSnapshot) {
      // Two consecutive snapshots agree and the server copy is terminal:
      // the turn ended while the stream was down. Adopt its ending.
      turn.draft = lastAssistant;
      messages.setMessages(turn.chatId, fetched);
      endTurn(turn);
      return;
    }
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
  if (turn.draft.status === "pending" && turn.draft.text.length === 0) {
    messages.removeMessage(chatId, turn.draft.id);
  } else {
    messages.patchMessage(chatId, turn.draft.id, { status: "interrupted" });
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
  const message = error instanceof Error && error.message ? error.message : "The reply failed.";
  if (isCurrent) {
    messages.patchMessage(turn.chatId, turn.draft.id, { status: "error" });
    messages.setTurnError(turn.chatId, message);
    messages.setTurnActive(turn.chatId, false);
    useChatsStore.getState().touch(turn.chatId);
  }
  settleTurn(turn);
}

export function isTurnLive(chatId: ChatId): boolean {
  return liveTurns.has(chatId);
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
