/**
 * HTTP transport for the OpenCode V2 API, built on the official
 * `@opencode/client` package (version-matched to the pinned server line).
 *
 * Only this directory knows the OpenCode API; everything above the provider
 * layer consumes `src/providers/types.ts` + `src/domain/` exclusively.
 */

import { OpenCode, type OpenCodeClient } from "@opencode/client";
import { fetch as streamingFetch } from "expo/fetch";
import { ConnectionError, type ConnectionConfig } from "@/src/providers/types";

export type { OpenCodeClient };

/** Normalized, validated base URL (no trailing slash). Throws ConnectionError. */
export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new ConnectionError("invalid-url", "Enter a server URL.", false);
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new ConnectionError("invalid-url", "That does not look like a valid URL.", false);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ConnectionError("invalid-url", "The URL must start with http:// or https://.", false);
  }
  return trimmed.replace(/\/+$/, "");
}

/**
 * Creates the OpenCode client. `expo/fetch` is the default transport:
 * React Native's built-in fetch buffers whole responses, which the event
 * stream needs.
 */
export function createOpenCodeClient(
  cfg: ConnectionConfig,
  fetchImpl: typeof fetch = streamingFetch,
): OpenCodeClient {
  return OpenCode.make({ baseUrl: normalizeBaseUrl(cfg.baseUrl), fetch: fetchImpl });
}

/** A request-scoped AbortController that aborts itself after `ms`. */
export function timeoutSignal(ms: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

export function toConnectionError(error: unknown): ConnectionError {
  if (error instanceof ConnectionError) return error;
  if (error instanceof Error && error.name === "ClientError") {
    const reason = (error as { reason?: string }).reason;
    const cause = error.cause;
    if (reason === "Transport") {
      if (cause instanceof Error && cause.name === "AbortError") {
        return new ConnectionError("timeout", "The server did not respond in time.", true);
      }
      return new ConnectionError("unreachable", "Could not reach the server.", true);
    }
    if (reason === "UnexpectedStatus") {
      const status = (cause as { status?: number } | undefined)?.status ?? 0;
      if (status === 401 || status === 403) {
        return new ConnectionError("unauthorized", "The server rejected the request.", false);
      }
      if (status >= 500) {
        return new ConnectionError("server-error", "The server reported an internal error.", true);
      }
      return new ConnectionError(
        "unknown",
        `The server responded with status ${status || "error"}.`,
        false,
      );
    }
    if (reason === "UnsupportedContentType") {
      // The client throws this when a declared error status (e.g. 401 on
      // /api/info) arrives with an empty, non-JSON body — the stock server's
      // unauthenticated response — losing the status. Treat it as an auth
      // rejection; it does not occur on happy-path responses.
      return new ConnectionError("unauthorized", "The server rejected the request.", false);
    }
    return new ConnectionError("unknown", "Unexpected error.", true);
  }
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return new ConnectionError("timeout", "The server did not respond in time.", true);
    }
    // Last-resort transport heuristics (kept for injected fetch impls).
    const message = error.message ?? "";
    if (
      error instanceof TypeError ||
      message.includes("Network request failed") ||
      message.startsWith("fetch failed") ||
      message.includes("ConnectException") ||
      message.includes("UnknownHostException")
    ) {
      return new ConnectionError("unreachable", "Could not reach the server.", true);
    }
    return new ConnectionError("unknown", message || "Unexpected error.", true);
  }
  return new ConnectionError("unknown", "Unexpected error.", true);
}
