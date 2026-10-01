/**
 * HTTP transport for the OpenCode V2 API, built on the official
 * `@opencode/client` package (version-matched to the pinned server line).
 *
 * Only this directory knows the OpenCode API; everything above the provider
 * layer consumes `src/providers/types.ts` + `src/domain/` exclusively.
 */

import { OpenCode, type OpenCodeClient } from "@opencode/client";
import { encode as base64 } from "js-base64";
import { fetch as streamingFetch } from "expo/fetch";
import { t } from "@/src/i18n";
import { ConnectionError, type ConnectionConfig } from "@/src/providers/types";

export type { OpenCodeClient };

/** Basic auth username required by the OpenCode v2 server. */
const AUTH_USERNAME = "opencode";

/** Normalized, validated base URL (no trailing slash). Throws ConnectionError. */
export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new ConnectionError("invalid-url", t("errors.connection.urlMissing"), false);
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new ConnectionError("invalid-url", t("errors.connection.urlInvalid"), false);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ConnectionError("invalid-url", t("errors.connection.urlScheme"), false);
  }
  return trimmed.replace(/\/+$/, "");
}

/**
 * Creates the OpenCode client. `expo/fetch` is the default transport:
 * React Native's built-in fetch buffers whole responses, which the event
 * stream needs. When a password is configured, requests carry basic auth
 * (the v2 server requires username "opencode").
 */
export function createOpenCodeClient(
  cfg: ConnectionConfig,
  fetchImpl: typeof fetch = streamingFetch,
): OpenCodeClient {
  const password = cfg.credentials?.password;
  return OpenCode.make({
    baseUrl: normalizeBaseUrl(cfg.baseUrl),
    fetch: fetchImpl,
    ...(password
      ? { headers: { authorization: `Basic ${base64(`${AUTH_USERNAME}:${password}`)}` } }
      : {}),
  });
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
        return new ConnectionError("timeout", t("errors.connection.timeout"), true);
      }
      return new ConnectionError("unreachable", t("errors.connection.unreachable"), true);
    }
    if (reason === "UnexpectedStatus") {
      const status = (cause as { status?: number } | undefined)?.status ?? 0;
      if (status === 401 || status === 403) {
        return new ConnectionError("unauthorized", t("errors.connection.unauthorized"), false);
      }
      if (status >= 500) {
        return new ConnectionError("server-error", t("errors.connection.serverError"), true);
      }
      return new ConnectionError(
        "unknown",
        status
          ? t("errors.connection.status", { status })
          : t("errors.connection.unexpectedStatus"),
        false,
      );
    }
    if (reason === "UnsupportedContentType") {
      // The client throws this when a declared error status (e.g. 401 on
      // /api/info) arrives with an empty, non-JSON body — the stock server's
      // unauthenticated response — losing the status. Treat it as an auth
      // rejection; it does not occur on happy-path responses.
      return new ConnectionError("unauthorized", t("errors.connection.unauthorized"), false);
    }
    return new ConnectionError("unknown", t("errors.unexpected"), true);
  }
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return new ConnectionError("timeout", t("errors.connection.timeout"), true);
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
      return new ConnectionError("unreachable", t("errors.connection.unreachable"), true);
    }
    return new ConnectionError("unknown", message || t("errors.unexpected"), true);
  }
  return new ConnectionError("unknown", t("errors.unexpected"), true);
}
