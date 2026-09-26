/**
 * App-owned domain types.
 *
 * These types are the app's own vocabulary for chat features. Nothing in this
 * directory may depend on a specific backend implementation — the adapter
 * layer translates whatever a backend speaks into these types.
 */

/** Identifier of a chat backend provider, e.g. "opencode". */
export type ProviderId = string;

/** Provider-native chat identifier; opaque to the app. */
export type ChatId = string;

/**
 * Identifies a model on a backend: which provider serves it and its model id,
 * plus the variant (e.g. a reasoning effort) it runs with. No variant means
 * the model's own default.
 */
export interface ModelRef {
  provider: string;
  id: string;
  variant?: string;
}

/** A named preset of a model, such as a reasoning effort level. */
export interface ModelVariant {
  id: string;
  /** Human-facing label, e.g. "Extra high". */
  label: string;
}

export interface ModelInfo {
  ref: ModelRef;
  /** Human-facing label, e.g. "GLM-5.3-Flash". */
  label: string;
  /**
   * Human-facing name of the provider serving the model, e.g. "OpenCode Zen".
   * Omitted when the backend does not name its providers; the UI falls back
   * to `ref.provider`.
   */
  providerLabel?: string;
  contextWindow?: number;
  /** Variants the model can run with, in the backend's order; empty when it has none. */
  variants?: ModelVariant[];
}

export interface Attachment {
  /** Where the file can be displayed from: a local file uri, or empty when only `bytes` is set. */
  uri: string;
  mimeType: string;
  name: string;
  /**
   * Base64 payload without a data-uri prefix. Backends receive attachments
   * inline, so freshly picked files carry their bytes here; transcripts read
   * back from a backend carry the bytes the backend stored.
   */
  bytes?: string;
  size?: number;
}

export interface UserMessage {
  id: string;
  text: string;
  attachments?: Attachment[];
}

export interface TokenUsage {
  input?: number;
  output?: number;
  reasoning?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export type FormValue = string | number | boolean | string[];

export type FormAnswer = Record<string, FormValue>;

export interface FormOption {
  value: string;
  label: string;
  description?: string;
}

/** Shows a field only while another field's answer matches. */
export interface FormCondition {
  key: string;
  op: "eq" | "neq";
  value: string | number | boolean;
}

interface FormFieldBase {
  key: string;
  title?: string;
  description?: string;
  required: boolean;
  /** Never shown; its default is still sent with the answer. */
  hidden?: boolean;
  /** All must hold for the field to be shown and answered. */
  when?: FormCondition[];
}

/**
 * One question on a form. A text field with `options` is a single choice;
 * `custom` also lets the user type an answer of their own.
 */
export type FormField =
  | (FormFieldBase & {
      type: "text";
      default?: string;
      placeholder?: string;
      options?: FormOption[];
      custom?: boolean;
      minLength?: number;
      maxLength?: number;
      /** A regular expression the whole answer must match. */
      pattern?: string;
    })
  | (FormFieldBase & {
      type: "number";
      integer: boolean;
      default?: number;
      minimum?: number;
      maximum?: number;
    })
  | (FormFieldBase & { type: "boolean"; default?: boolean })
  | (FormFieldBase & {
      type: "multiselect";
      options: FormOption[];
      custom?: boolean;
      default?: string[];
      minItems?: number;
      maxItems?: number;
    })
  /** Not an answer: a page the user opens, such as a sign-in. */
  | (FormFieldBase & { type: "link"; url: string });

/**
 * A question the backend asks in the middle of a run and waits on. The run
 * stalls until the user answers or dismisses it, or the backend gives up.
 */
export interface ChatForm {
  id: string;
  title: string;
  fields: FormField[];
}

/**
 * Normalized stream events — the only events the chat UI ever sees.
 * Backend-specific event types (tools, permissions, compaction, …) are
 * collapsed by the adapter into this closed set; the app decides what to do.
 */
export type StreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "reasoning-delta"; text: string }
  | { type: "message-complete"; usage?: TokenUsage }
  | { type: "chat-idle" }
  | { type: "form"; form: ChatForm }
  /** The form was answered, dismissed or dropped, here or elsewhere. */
  | { type: "form-closed"; formId: string }
  | { type: "error"; message: string; retryable: boolean };

export type MessageRole = "user" | "assistant";

export type MessageStatus = "pending" | "streaming" | "complete" | "error" | "interrupted";

export interface Message {
  id: string;
  role: MessageRole;
  text: string;
  reasoning?: string;
  attachments?: Attachment[];
  status: MessageStatus;
  usage?: TokenUsage;
  createdAt: number;
}

export interface ChatSummary {
  id: ChatId;
  title: string;
  updatedAt: number;
  model?: ModelRef;
}

/**
 * Feature flags a backend supports. UI affordances (composer buttons,
 * drawers, model picker) render conditionally on these instead of on
 * backend-specific knowledge.
 */
export interface Capabilities {
  reasoning: boolean;
  attachments: boolean;
  interrupt: boolean;
  /** Native regenerate support; when false the app re-sends instead. */
  regenerate: boolean;
  modelSelection: boolean;
  deleteChat: boolean;
}
