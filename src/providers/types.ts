/**
 * Provider seam types.
 *
 * The chat feature works against `ChatProvider` only. Each backend ships an
 * adapter that implements it; a registry of `ProviderDescriptor`s drives the
 * connection UI and store wiring.
 */

import type { TFunction } from "i18next";
import type {
  Capabilities,
  ChatForm,
  ChatId,
  ChatSummary,
  Delivery,
  FormAnswer,
  Message,
  ModelInfo,
  ModelRef,
  ProviderId,
  QueuedMessage,
  StreamEvent,
  UsageQuery,
  UsageReport,
  UserMessage,
} from "@/src/domain";

export interface ConnectionConfig {
  baseUrl: string;
  /**
   * Optional server password. The stock v2 server always enforces basic
   * auth (username "opencode"); empty means an unauthenticated deployment.
   */
  credentials?: { password?: string };
}

export interface ConnectionInfo {
  serverVersion?: string;
  serverName?: string;
}

/**
 * Why a connection attempt failed, in terms the UI can act on:
 * invalid-url (malformed input), unreachable (network/DNS), timeout,
 * unauthorized (the server refused access), server-error (5xx), unknown.
 */
export type ConnectionErrorCode =
  "invalid-url" | "unreachable" | "timeout" | "unauthorized" | "server-error" | "unknown";

export class ConnectionError extends Error {
  readonly code: ConnectionErrorCode;
  readonly retryable: boolean;

  constructor(code: ConnectionErrorCode, message: string, retryable: boolean) {
    super(message);
    this.name = "ConnectionError";
    this.code = code;
    this.retryable = retryable;
  }
}

export interface ChatProvider {
  readonly id: ProviderId;
  readonly capabilities: Capabilities;

  /** Health check + server identification. Throws ConnectionError on failure. */
  connect(cfg: ConnectionConfig): Promise<ConnectionInfo>;
  listModels(): Promise<ModelInfo[]>;
  /**
   * Yields whenever `listModels()` may answer differently: once the stream
   * is up, since changes made while nothing listened are not replayed, and
   * on every catalog change the backend announces. Ends when the stream
   * drops; the caller resubscribes. Without it the catalog is only re-read
   * on demand.
   */
  catalogChanges?(signal: AbortSignal): AsyncIterable<void>;
  listChats(): Promise<ChatSummary[]>;
  /** Creates a backend chat. `title` may be ignored by the backend. */
  createChat(opts?: { model?: ModelRef; title?: string }): Promise<ChatSummary>;
  deleteChat(id: ChatId): Promise<void>;
  /** Only present when `capabilities.renameChat` is true. */
  renameChat?(id: ChatId, title: string): Promise<void>;
  /**
   * A new chat holding the messages of `id` that come before `before`, a
   * backend-native message id; without it, the whole chat. Only present when
   * `capabilities.branch` is true.
   */
  branchChat?(id: ChatId, before?: string): Promise<ChatSummary>;

  /** Fire-and-forget prompt delivery; streaming arrives via events(). */
  send(chatId: ChatId, msg: UserMessage): Promise<void>;

  /**
   * The queue: only present when `capabilities.queue` is true. A message sent
   * while a reply runs waits on the backend, and the run's events say when it
   * joins the transcript (`queued-delivered`).
   *
   * `msg.id` must come from `newMessageId()`: it is the id the message keeps
   * in the transcript, so the delivery can be matched even when it is
   * announced before the request that queued it returns.
   */
  queueMessage?(chatId: ChatId, msg: UserMessage, delivery: Delivery): Promise<void>;
  newMessageId?(): string;
  /** Oldest first. */
  queuedMessages?(chatId: ChatId): Promise<QueuedMessage[]>;
  cancelQueued?(chatId: ChatId, id: string): Promise<void>;
  /**
   * Delivers a queued message as soon as the reply's current step ends. On an
   * idle chat that starts a run, as a sent message would.
   */
  steerQueued?(chatId: ChatId, id: string): Promise<void>;
  interrupt(chatId: ChatId): Promise<void>;
  /**
   * Summarizes the chat to free up the model's context. Only present when
   * `capabilities.compact` is true. On an idle chat it starts a run, which
   * `isRunning` and the event stream report as they would a reply.
   */
  compact?(chatId: ChatId): Promise<void>;
  /**
   * Whether the backend is still working on a run in this chat, whoever
   * started it. Without it the app can only guess from the transcript, and
   * cannot pick up runs it did not start.
   */
  isRunning?(chatId: ChatId): Promise<boolean>;
  /**
   * Switches the model of an existing chat, variant included: a ref without
   * a variant puts the chat back on the model's default.
   */
  setChatModel(chatId: ChatId, model: ModelRef): Promise<void>;

  /**
   * Re-runs a turn natively: the backend drops the turn identified by
   * `msg.id` (a backend-native message id) together with everything after it,
   * then runs `msg` again. Only present when `capabilities.regenerate` is
   * true; otherwise the app re-sends through `send()` and keeps the old turn.
   *
   * Backends that need two requests express them as `prepareRegenerate()` +
   * `regenerate()`: the app runs the first one before it subscribes to the
   * rerun's events, so bookkeeping events the backend emits while preparing
   * are not mistaken for the rerun's own. A backend that does it in one
   * request implements `regenerate()` alone.
   */
  regenerate?(chatId: ChatId, msg: UserMessage): Promise<void>;
  /** First half of a two-request rerun; see `regenerate`. */
  prepareRegenerate?(chatId: ChatId, msg: UserMessage): Promise<void>;
  /**
   * Abandons a rerun that never reached the backend (e.g. the app was killed
   * between preparing and delivering it), so a later message cannot silently
   * discard older turns.
   */
  discardRegenerate?(chatId: ChatId): Promise<void>;

  /**
   * Settle a form the backend raised with a `form` event. Only backends that
   * emit forms implement these.
   */
  answerForm?(chatId: ChatId, formId: string, answer: FormAnswer): Promise<void>;
  dismissForm?(chatId: ChatId, formId: string): Promise<void>;
  /**
   * Forms still waiting on an answer. The event stream is live-only, so a
   * form raised while nothing was subscribed only shows up here.
   */
  pendingForms?(chatId: ChatId): Promise<ChatForm[]>;

  /** Normalized event stream for one chat. Pass a signal to stop it. */
  events(chatId: ChatId, signal?: AbortSignal): AsyncIterable<StreamEvent>;
  /**
   * Reconciliation / cold open source of truth. Every message has a terminal
   * status: a reply the transcript shows unfinished is `interrupted`, since a
   * transcript cannot tell a live run from a dead one. Whether it still runs
   * is for `isRunning` to say.
   */
  fetchMessages(chatId: ChatId): Promise<Message[]>;

  /** Only present when `capabilities.usageReport` is true. */
  usageReport?(query: UsageQuery): Promise<UsageReport>;
}

export interface ConfigField {
  key: "baseUrl" | "password";
  label: string;
  description?: string;
  required: boolean;
  /** Render as a password input. */
  secure?: boolean;
  placeholder?: string;
  keyboardType?: "default" | "url";
}

export interface ProviderDescriptor {
  id: ProviderId;
  label: string;
  fields(t: TFunction): ConfigField[];
  /** The same as every instance's `capabilities`; the UI reads them from here. */
  capabilities: Capabilities;
  create(cfg: ConnectionConfig): ChatProvider;
}
