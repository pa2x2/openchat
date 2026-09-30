/**
 * Event subscription for the OpenCode V2 API.
 *
 * Subscribes through the official client's shared event stream (live-only,
 * no replay), filters events to one chat session, and feeds them through
 * the normalizer. Reconnection is an app-owned concern built on top.
 */

import type { ChatId, ModelRef, StreamEvent } from "@/src/domain";
import { toConnectionError, type OpenCodeClient } from "./client";
import { normalizeV2Event, type V2EventShape } from "./normalize";
import { fromWireModel } from "./sessions";

function isEventForChat(event: V2EventShape, chatId: ChatId): boolean {
  // Forms carry their session inside the form, not beside it.
  return (event.data?.sessionID ?? event.data?.form?.sessionID) === chatId;
}

/**
 * A starting server answers the model list with nothing, then a partial
 * list, while its providers load; `model.updated` marks the finished
 * catalog. `provider.updated` changes the provider names shown with it.
 */
const CATALOG_EVENTS = new Set(["server.connected", "model.updated", "provider.updated"]);

export async function* catalogChanges(
  client: OpenCodeClient,
  signal: AbortSignal,
): AsyncGenerator<void> {
  try {
    for await (const event of client.event.subscribe({ signal })) {
      if (CATALOG_EVENTS.has(event.type)) yield;
    }
  } catch {
    // A dropped stream just ends; the caller resubscribes.
  }
}

type StepEnd = Extract<StreamEvent, { type: "message-complete" }>;

/**
 * A step's end says what it used but not which model ran it or for how long:
 * those are on the events before it. This carries them over to the end. A
 * step whose start came before the subscription ends without them.
 */
function stepTracker(): (event: V2EventShape) => Pick<StepEnd, "model" | "generationMs"> {
  let step: { id?: string; model?: ModelRef; started?: number; written?: number } | null = null;
  return (event) => {
    const id = event.data.assistantMessageID;
    if (event.type === "session.step.started") {
      const { model, started } = event.data;
      step = { id, started, ...(model ? { model: fromWireModel(model) } : {}) };
      return {};
    }
    if (!step || step.id !== id) return {};
    // The model is done writing here; the step stays open while its tools run.
    if (event.type === "session.step.streamed") step.written = event.created;
    if (event.type !== "session.step.ended") return {};
    const { model, started, written } = step;
    return {
      ...(model ? { model } : {}),
      ...(started !== undefined && written !== undefined
        ? { generationMs: written - started }
        : {}),
    };
  };
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
  const trackStep = stepTracker();
  try {
    for await (const event of client.event.subscribe({ signal })) {
      // The typed union carries the structural subset used here on every
      // session-scoped member; one boundary cast keeps the normalizer pure.
      const shape = event as unknown as V2EventShape;
      // The server's first event on every subscription, tied to no chat.
      if (shape.type === "server.connected") {
        yield { type: "connected" };
        continue;
      }
      if (!isEventForChat(shape, chatId)) continue;
      const tracked = trackStep(shape);
      const normalized = normalizeV2Event(shape);
      if (!normalized) continue;
      yield normalized.type === "message-complete" ? { ...normalized, ...tracked } : normalized;
    }
  } catch (error) {
    if (signal.aborted) return;
    const mapped = toConnectionError(error);
    yield { type: "error", message: mapped.message, retryable: mapped.retryable };
  }
}
