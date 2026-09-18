/**
 * Normalizes OpenCode V2 events into the app's StreamEvent vocabulary.
 *
 * The adapter collapses the server's event vocabulary (steps, tools,
 * permissions, compaction, …) into the closed StreamEvent set; the app
 * decides what to do with each event. Event names verified against the
 * pinned server version.
 */

import type { StreamEvent, TokenUsage } from "@/src/domain";

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
    error?: { name?: string; data?: { message?: string; [key: string]: unknown } } | null;
    [key: string]: unknown;
  };
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
      return {
        type: "error",
        message: "The server failed to complete the reply.",
        retryable: true,
      };
    case "session.error": {
      const name = event.data.error?.name;
      const message = event.data.error?.data?.message ?? "The server reported an error.";
      return {
        type: "error",
        message,
        // User-initiated aborts and auth problems are not transient.
        retryable: name !== "MessageAbortedError" && name !== "ProviderAuthError",
      };
    }
    default:
      return null; // everything the chat UI must not see
  }
}
