/**
 * Event subscription for the OpenCode V2 API.
 *
 * Subscribes through the official client's shared event stream (live-only,
 * no replay), filters events to one chat session, and feeds them through
 * the normalizer. Reconnection is an app-owned concern built on top.
 */

import type { ChatId, StreamEvent } from "@/src/domain";
import { toConnectionError, type OpenCodeClient } from "./client";
import { normalizeV2Event, type V2EventShape } from "./normalize";

function isEventForChat(event: V2EventShape, chatId: ChatId): boolean {
  return event.data?.sessionID === chatId;
}

/**
 * Normalized event stream for one chat. Transport-level failures after the
 * stream is up surface as a retryable error event; the caller can re-
 * subscribe on recovery (live-only subscription by design).
 */
export async function* chatEvents(
  client: OpenCodeClient,
  chatId: ChatId,
  signal: AbortSignal,
): AsyncGenerator<StreamEvent> {
  try {
    for await (const event of client.event.subscribe({ signal })) {
      // The typed union carries the structural subset used here on every
      // session-scoped member; one boundary cast keeps the normalizer pure.
      const shape = event as unknown as V2EventShape;
      if (!isEventForChat(shape, chatId)) continue;
      const normalized = normalizeV2Event(shape);
      if (normalized) yield normalized;
    }
  } catch (error) {
    if (signal.aborted) return;
    const mapped = toConnectionError(error);
    yield { type: "error", message: mapped.message, retryable: mapped.retryable };
  }
}
