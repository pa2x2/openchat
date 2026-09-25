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
    error?: {
      name?: string;
      type?: string;
      message?: string;
      status?: number;
      data?: { message?: string; [key: string]: unknown } | null;
    } | null;
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
    default:
      return null; // everything the chat UI must not see
  }
}
