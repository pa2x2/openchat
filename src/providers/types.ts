/**
 * Provider seam types.
 *
 * The chat feature works against `ChatProvider` only. Each backend ships an
 * adapter that implements it; a registry of `ProviderDescriptor`s drives the
 * connection UI and store wiring.
 */

import type {
  Capabilities,
  ChatId,
  ChatSummary,
  Message,
  ModelInfo,
  ModelRef,
  ProviderId,
  StreamEvent,
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
  /** Server-reported version, when available. */
  serverVersion?: string;
  /** Server-reported name/label, when available. */
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
  listChats(): Promise<ChatSummary[]>;
  createChat(opts?: { model?: ModelRef; title?: string }): Promise<ChatSummary>;
  deleteChat(id: ChatId): Promise<void>;

  /** Fire-and-forget prompt delivery; streaming arrives via events(). */
  send(chatId: ChatId, msg: UserMessage): Promise<void>;
  interrupt(chatId: ChatId): Promise<void>;

  /** Normalized event stream for one chat. Pass a signal to stop it. */
  events(chatId: ChatId, signal?: AbortSignal): AsyncIterable<StreamEvent>;
  /** Reconciliation / cold open source of truth. */
  fetchMessages(chatId: ChatId): Promise<Message[]>;
}

/** A single connection-form field, described by the provider. */
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

/** Registry entry: drives config UI and constructs provider instances. */
export interface ProviderDescriptor {
  id: ProviderId;
  label: string;
  fields: ConfigField[];
  create(cfg: ConnectionConfig): ChatProvider;
}
