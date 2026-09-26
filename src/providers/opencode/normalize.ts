/**
 * Normalizes OpenCode V2 events into the app's StreamEvent vocabulary.
 *
 * The adapter collapses the server's event vocabulary (steps, tools,
 * permissions, compaction, …) into the closed StreamEvent set; the app
 * decides what to do with each event. Event names verified against the
 * pinned server version.
 */

import type {
  ChatForm,
  FormCondition,
  FormField,
  FormOption,
  FormValue,
  StreamEvent,
  TokenUsage,
  ToolCategory,
} from "@/src/domain";

/** Structural subset of the client's form field union. */
interface WireField {
  key: string;
  type: "string" | "number" | "integer" | "boolean" | "multiselect" | "external";
  title?: string;
  description?: string;
  required?: boolean;
  hidden?: boolean;
  when?: FormCondition[];
  default?: FormValue;
  placeholder?: string;
  options?: FormOption[];
  custom?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  // The server spells unbounded limits as "Infinity"/"-Infinity".
  minimum?: number | string;
  maximum?: number | string;
  minItems?: number;
  maxItems?: number;
  url?: string;
}

export interface WireForm {
  id: string;
  title: string;
  fields: readonly WireField[];
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toFormField(field: WireField): FormField {
  const base = {
    key: field.key,
    required: field.required ?? false,
    ...(field.title ? { title: field.title } : {}),
    ...(field.description ? { description: field.description } : {}),
    ...(field.hidden ? { hidden: true } : {}),
    ...(field.when?.length ? { when: field.when } : {}),
  };
  switch (field.type) {
    case "string":
      return {
        ...base,
        type: "text",
        default: typeof field.default === "string" ? field.default : undefined,
        placeholder: field.placeholder,
        options: field.options,
        custom: field.custom,
        minLength: field.minLength,
        maxLength: field.maxLength,
        pattern: field.pattern,
      };
    case "number":
    case "integer":
      return {
        ...base,
        type: "number",
        integer: field.type === "integer",
        default: finite(field.default),
        minimum: finite(field.minimum),
        maximum: finite(field.maximum),
      };
    case "boolean":
      return {
        ...base,
        type: "boolean",
        default: typeof field.default === "boolean" ? field.default : undefined,
      };
    case "multiselect":
      return {
        ...base,
        type: "multiselect",
        options: field.options ?? [],
        custom: field.custom,
        default: Array.isArray(field.default) ? field.default : undefined,
        minItems: field.minItems,
        maxItems: field.maxItems,
      };
    case "external":
      return { ...base, required: false, type: "link", url: field.url ?? "" };
  }
}

export function toChatForm(form: WireForm): ChatForm {
  return { id: form.id, title: form.title, fields: form.fields.map(toFormField) };
}

// OpenCode's built-in tools. Anything else (MCP, plugins) is "other".
const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  bash: "command",
  read: "read",
  list: "read",
  glob: "search",
  grep: "search",
  edit: "edit",
  write: "edit",
  patch: "edit",
  apply_patch: "edit",
  webfetch: "web-fetch",
  websearch: "web-search",
  task: "subtask",
};

export function toolCategory(name: string): ToolCategory {
  return TOOL_CATEGORIES[name] ?? "other";
}

// The input fields that name what the built-in tools work on.
const SUBJECT_KEYS = ["query", "url", "command", "filePath", "pattern", "path", "description"];

export function toolSubject(input: unknown): string {
  if (typeof input !== "object" || input === null) return "";
  const fields = input as Record<string, unknown>;
  for (const key of SUBJECT_KEYS) {
    const value = fields[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return "";
}

const THINKING: StreamEvent = { type: "activity", activity: { kind: "thinking" } };

/** Structural subset of the client's V2Event union the normalizer consumes. */
export interface V2EventShape {
  type: string;
  data: {
    sessionID?: string;
    assistantMessageID?: string;
    delta?: string;
    tokens?: {
      input: number;
      output: number;
      reasoning: number;
      cache: { read: number; write: number };
    };
    error?: {
      name?: string;
      type?: string;
      message?: string;
      status?: number;
      data?: { message?: string; [key: string]: unknown } | null;
    } | null;
    form?: WireForm & { sessionID: string };
    [key: string]: unknown;
  };
}

/**
 * Extracts the human-readable reason from a server error payload. The wire
 * shape puts the message directly on the error (`{ type, message, status }`);
 * other variants nest it under `data.message`. The reason matters: it is the
 * only place the user learns *why* a run failed.
 */
function errorMessage(error: V2EventShape["data"]["error"], fallback: string): string {
  for (const candidate of [error?.message, error?.data?.message]) {
    if (typeof candidate === "string" && candidate.trim().length > 0) return candidate;
  }
  return fallback;
}

export function normalizeV2Event(event: V2EventShape): StreamEvent | null {
  switch (event.type) {
    case "session.text.delta": {
      const delta = event.data.delta;
      return typeof delta === "string" && delta.length > 0
        ? { type: "text-delta", text: delta }
        : null;
    }
    case "session.reasoning.delta": {
      const delta = event.data.delta;
      return typeof delta === "string" && delta.length > 0
        ? { type: "reasoning-delta", text: delta }
        : null;
    }
    // A step hands control back to the model, which may sit silent for a
    // while before its next token.
    case "session.step.started":
    case "session.reasoning.started":
    case "session.compaction.ended":
      return THINKING;
    case "session.text.started":
      return { type: "activity", activity: null };
    // A call is named when the model starts writing its input, and gets that
    // input once the model is done with it.
    case "session.tool.input.started": {
      const id = event.data.id;
      if (typeof id !== "string") return null;
      const name = typeof event.data.name === "string" ? event.data.name : "";
      return {
        type: "tool",
        id,
        update: { name, category: toolCategory(name), subject: "", status: "running" },
      };
    }
    case "session.tool.called":
    case "session.tool.success":
    case "session.tool.failed": {
      const id = event.data.id;
      if (typeof id !== "string") return null;
      if (event.type === "session.tool.called") {
        return { type: "tool", id, update: { subject: toolSubject(event.data.input) } };
      }
      const status = event.type === "session.tool.success" ? "done" : "failed";
      return { type: "tool", id, update: { status } };
    }
    case "session.retry.scheduled": {
      const attempt = event.data.attempt;
      return {
        type: "activity",
        activity: { kind: "retrying", attempt: typeof attempt === "number" ? attempt : 1 },
      };
    }
    case "session.compaction.started":
      return { type: "activity", activity: { kind: "compacting" } };
    case "session.step.ended": {
      const tokens = event.data.tokens;
      const usage: TokenUsage | undefined = tokens
        ? {
            input: tokens.input,
            output: tokens.output,
            reasoning: tokens.reasoning,
            cacheRead: tokens.cache?.read,
            cacheWrite: tokens.cache?.write,
          }
        : undefined;
      return { type: "message-complete", usage };
    }
    // One chat turn finished. The v2 server reports whole prompt runs via
    // `session.execution.*`; `session.idle` appears in newer builds.
    case "session.idle":
    case "session.execution.succeeded":
      return { type: "chat-idle" };
    case "session.execution.interrupted":
      return { type: "chat-idle" };
    case "session.execution.failed":
      // A server-reported execution failure is terminal for this prompt. The
      // transport layer emits its own retryable errors when a subscription
      // actually drops; treating this event as retryable creates an endless
      // reconnect loop for provider/auth failures.
      return {
        type: "error",
        message: errorMessage(event.data.error, "The server failed to complete the reply."),
        retryable: false,
      };
    // The server reports a failed step immediately before the matching
    // execution failure. Surfacing it directly means the reason reaches the
    // user even if the execution-level event never arrives.
    case "session.step.failed":
      return {
        type: "error",
        message: errorMessage(event.data.error, "The reply step failed."),
        retryable: false,
      };
    case "session.error": {
      return {
        type: "error",
        message: errorMessage(event.data.error, "The server reported an error."),
        // Errors reported by the server are application/provider failures, not
        // evidence that the live subscription should be retried indefinitely.
        retryable: false,
      };
    }
    case "form.created":
      return event.data.form ? { type: "form", form: toChatForm(event.data.form) } : null;
    // Answered or dismissed by any client, or dropped by the server when the
    // run moved on without it.
    case "form.replied":
    case "form.cancelled": {
      const formId = event.data.id;
      return typeof formId === "string" ? { type: "form-closed", formId } : null;
    }
    default:
      return null; // everything the chat UI must not see
  }
}
