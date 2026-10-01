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

/**
 * When a message sent during a reply joins the conversation: "steer" as soon
 * as the reply's current step ends, so the reply changes course; "queue" once
 * the reply is done, as the next turn.
 */
export type Delivery = "steer" | "queue";

/** A message sent during a reply that the backend holds until its delivery comes. */
export interface QueuedMessage extends UserMessage {
  delivery: Delivery;
  createdAt: number;
}

/**
 * Tokens as a backend counted them, each in one bucket only: input read from
 * a cache is not also in `input`, and reasoning is not also in `output`. An
 * adapter whose backend counts them inclusively subtracts.
 */
export interface TokenUsage {
  input?: number;
  output?: number;
  reasoning?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export interface Money {
  amount: number;
  /** ISO 4217 code, e.g. "USD". */
  currency: string;
}

/**
 * The span a usage report covers, in epoch milliseconds: `from` is in it and
 * `to` is not. Without `from` it starts at the backend's first record, and
 * without `to` it ends now.
 */
export interface UsageQuery {
  from?: number;
  to?: number;
  /** Also fill `UsageReport.days`. A backend may pay for every day, so ask only for a span worth charting. */
  daily?: boolean;
}

export interface UsageTotals {
  /** Round-trips to a model. */
  requests?: number;
  usage?: TokenUsage;
  /** Unset when nothing counted had a price. */
  cost?: Money;
}

/**
 * What a span of time used, as the backend counts it. A backend may count
 * only the chats it still has, so a deleted chat can be missing from it.
 */
export interface UsageReport extends UsageTotals {
  /** When the first use in the span happened; unset when the backend doesn't say. */
  from?: number;
  chats?: number;
  /** Messages the user sent. */
  prompts?: number;
  /** One entry per model and variant, in no particular order. */
  models: (UsageTotals & { model: ModelRef })[];
  /**
   * The days with use, oldest first. A day is a calendar day where the device
   * is, written "2026-09-30". Empty unless the query asked for days.
   */
  days: (UsageTotals & { date: string })[];
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
  /**
   * The tool call that raised the form, when the backend keeps the answers
   * with that call. Unset when the transcript will hold no trace of them.
   */
  toolId?: string;
}

/** What a form asked and what came back, as the reply that asked it shows it. */
export interface FormResult {
  /** The tool call that asked, or the form itself when there was none. */
  id: string;
  status: "waiting" | "answered" | "dismissed";
  questions: string[];
  /** One list per question, in order; empty for a question left unanswered. */
  answers: string[][];
}

export type ToolCategory =
  "command" | "read" | "search" | "edit" | "web-search" | "web-fetch" | "subtask" | "other";

export type ToolStatus = "running" | "done" | "failed";

export interface ToolCall {
  id: string;
  category: ToolCategory;
  /** The backend's own tool name. */
  name: string;
  /** What the call works on (a query, URL, command or path); empty until its input arrives. */
  subject: string;
  status: ToolStatus;
  /** The pages a web search found; set once it succeeds. */
  sources?: WebSource[];
}

export interface WebSource {
  title: string;
  url: string;
}

/**
 * One piece of an assistant reply, in the order the backend produced it. A
 * reply that uses tools interleaves them with its text: progress notes, the
 * calls they announce, and finally the answer.
 */
export type ReplyPart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool"; tool: ToolCall }
  | { type: "form"; form: FormResult };

/**
 * What a running reply is doing when it isn't writing text. Tool calls and
 * model round-trips can take minutes without a visible token; this is what
 * tells the user the run is still alive.
 */
export type TurnActivity =
  | { kind: "thinking" }
  /** `name` is the backend's own tool name, shown for the "other" category. */
  | { kind: "tool"; category: ToolCategory; name: string }
  /** The run is stalled on a form the user has not settled yet. */
  | { kind: "asking" }
  | { kind: "retrying"; attempt: number }
  | { kind: "compacting" };

/**
 * Normalized stream events — the only events the chat UI ever sees.
 * Backend-specific event types (tools, permissions, compaction, …) are
 * collapsed by the adapter into this closed set; the app decides what to do.
 */
export type StreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "reasoning-delta"; text: string }
  /** `null`: the reply is writing its text. */
  | { type: "activity"; activity: TurnActivity | null }
  /** Starts or updates the tool call `id`; fields left out keep their value. */
  | { type: "tool"; id: string; update: Partial<Omit<ToolCall, "id">> }
  /** Starts or updates the form result `id`; fields left out keep their value. */
  | { type: "form-result"; id: string; update: Partial<Omit<FormResult, "id">> }
  /**
   * One round-trip to the model is over; a reply that uses tools makes
   * several. The figures are that round-trip's alone, and the app adds them
   * up. Its `usage` is also how many tokens the model's context now holds.
   */
  | {
      type: "message-complete";
      usage?: TokenUsage;
      cost?: Money;
      generationMs?: number;
      model?: ModelRef;
    }
  /** The chat's totals so far, replacing the ones known before. */
  | { type: "chat-usage"; usage?: TokenUsage; cost?: Money }
  | { type: "chat-idle" }
  /**
   * The subscription is live: nothing from here on is missed. Whatever
   * happened before it, such as the run ending, has to be asked for.
   */
  | { type: "connected" }
  | { type: "form"; form: ChatForm }
  /** The form was answered, dismissed or dropped, here or elsewhere. */
  | { type: "form-closed"; formId: string }
  /**
   * A queued message joined the transcript. What the run writes from here on
   * answers it. The id can also be the turn's own prompt, which the backend
   * delivers the same way.
   */
  | { type: "queued-delivered"; id: string }
  /** A queued message was cancelled, here or elsewhere. */
  | { type: "queued-cancelled"; id: string }
  | { type: "queued-delivery"; id: string; delivery: Delivery }
  | { type: "error"; message: string; retryable: boolean };

export type MessageRole = "user" | "assistant";

export type MessageStatus = "pending" | "streaming" | "complete" | "error" | "interrupted";

export interface Message {
  id: string;
  role: MessageRole;
  /** For a reply, its text parts joined by blank lines. */
  text: string;
  /** A reply's parts in order. Missing on replies cached before parts existed. */
  parts?: ReplyPart[];
  attachments?: Attachment[];
  status: MessageStatus;
  /** What a reply used, over all of its round-trips to the model. */
  usage?: TokenUsage;
  /** How many round-trips `usage` counts. */
  requests?: number;
  /** Unset when the backend doesn't know the price, which is not the same as free. */
  cost?: Money;
  contextTokens?: number;
  /**
   * Milliseconds the model spent on a reply, without the time its tools ran
   * or a form waited. Unset unless it is known for every round-trip `usage`
   * counts, so that the two give a speed.
   */
  generationMs?: number;
  /** The model that wrote a reply; a chat can change models between replies. */
  model?: ModelRef;
  createdAt: number;
  /** When a reply stopped running; unset while it runs or when the backend didn't say. */
  completedAt?: number;
}

export const UNTITLED_CHAT = "Untitled chat";

export interface ChatSummary {
  id: ChatId;
  title: string;
  updatedAt: number;
  model?: ModelRef;
  /**
   * Everything the chat has used, as the backend counts it. That can be more
   * than its replies add up to: a backend may also count work that left no
   * reply behind, such as naming the chat or a reply that was regenerated.
   */
  usage?: TokenUsage;
  cost?: Money;
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
  renameChat: boolean;
  usageReport: boolean;
  /** Messages can be sent while a reply runs, and wait their turn on the backend. */
  queue: boolean;
  /** The chat can be summarized on request to free up the model's context. */
  compact: boolean;
}
