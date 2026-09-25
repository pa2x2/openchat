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

import type { ChatId, Message, StreamEvent, UserMessage } from "@/src/domain";
import { getProvider } from "@/src/lib/providerFactory";
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
}

const liveTurns = new Map<ChatId, LiveTurn>();

function isCurrentTurn(turn: LiveTurn): boolean {
  return !turn.finished && liveTurns.get(turn.chatId) === turn;
}

function settleTurn(turn: LiveTurn): void {
  if (turn.finished) return;
  turn.finished = true;
  turn.resolveCompletion();
}

/**
 * Sends a user message into a chat and streams the reply.
 *
 * Resolves when the turn ends: chat-idle, a fatal error, or a user
 * interrupt. Delivery failures (the prompt POST itself) mark the turn
 * failed immediately — the optimistic messages stay on screen with error
 * status so nothing the user typed is lost.
 */
export async function sendMessage(chatId: ChatId, text: string): Promise<void> {
  const userMessage: UserMessage = { id: localId("user"), text };
  beginTurn(chatId, userMessage);
  const turn = liveTurns.get(chatId);
  if (!turn) return;

  // Subscribe first so early deltas are not missed, then deliver the prompt.
  const consuming = consumeEvents(turn);
  try {
    const delivery = getProvider().then((provider) => {
      if (!provider) throw new Error("Not connected. Open Settings to connect.");
      return provider.send(chatId, userMessage);
    });
    // Some provider event iterators do not promptly close when their signal is
    // aborted. The local completion signal keeps Stop responsive even when the
    // underlying iterator is still winding down.
    await Promise.race([delivery, turn.completion]);
    if (!isCurrentTurn(turn)) return;
  } catch (error) {
    if (!turn.finished) failTurn(turn, error);
    return;
  }
  await Promise.race([consuming, turn.completion]);
}

function beginTurn(chatId: ChatId, userMessage: UserMessage): void {
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

/** Consumes the event stream until the turn ends. */
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

/** Applies one normalized event to the live turn. */
function applyEvent(turn: LiveTurn, event: StreamEvent): void {
  if (turn.finished) return;
  if (turn.paused) {
    turn.queue.push(event);
    return;
  }
  const messages = useMessagesStore.getState();
  switch (event.type) {
    case "text-delta":
      turn.draft = {
        ...turn.draft,
        status: "streaming",
        text: turn.draft.text + event.text,
      };
      messages.patchMessage(turn.chatId, turn.draft.id, {
        status: "streaming",
        text: turn.draft.text,
      });
      break;
    case "reasoning-delta":
      turn.draft = {
        ...turn.draft,
        status: "streaming",
        reasoning: (turn.draft.reasoning ?? "") + event.text,
      };
      messages.patchMessage(turn.chatId, turn.draft.id, {
        status: "streaming",
        reasoning: turn.draft.reasoning,
      });
      break;
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
  turn.controller.abort();
  if (liveTurns.get(chatId) === turn) liveTurns.delete(chatId);
  const messages = useMessagesStore.getState();
  if (turn.draft.status === "pending" && turn.draft.text.length === 0) {
    // Nothing streamed yet — remove the empty placeholder entirely.
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

/** Marks a turn failed: the optimistic assistant message shows the error. */
function failTurn(turn: LiveTurn, error: unknown): void {
  if (turn.finished) return;
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

/** True while a turn is streaming for the chat (drives the interrupt UI). */
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
