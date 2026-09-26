/**
 * Session (chat) operations against the OpenCode V2 API.
 */

import type { ModelRef as OpenCodeModelRef, SessionInfo } from "@opencode/client";
import type { ChatId, ChatSummary, ModelRef } from "@/src/domain";
import type { OpenCodeClient } from "./client";

/**
 * What the server reports for a session switched to a model without a
 * variant: the model runs on its own defaults, which the app models as no
 * variant at all.
 */
const DEFAULT_VARIANT = "default";

function toWireModel(model: ModelRef): OpenCodeModelRef {
  return {
    providerID: model.provider,
    id: model.id,
    ...(model.variant ? { variant: model.variant } : {}),
  };
}

function fromWireModel(model: OpenCodeModelRef): ModelRef {
  return {
    provider: model.providerID,
    id: model.id,
    ...(model.variant && model.variant !== DEFAULT_VARIANT ? { variant: model.variant } : {}),
  };
}

export async function listChats(client: OpenCodeClient): Promise<ChatSummary[]> {
  const response = await client.session.list({ limit: 100, order: "desc" });
  return response.data.filter((session) => !session.time?.archived).map(toChatSummary);
}

export async function createChat(
  client: OpenCodeClient,
  opts?: { model?: ModelRef; title?: string },
): Promise<ChatSummary> {
  const session = await client.session.create({
    title: opts?.title ?? null,
    ...(opts?.model ? { model: toWireModel(opts.model) } : {}),
  });
  return toChatSummary(session);
}

export async function deleteChat(client: OpenCodeClient, id: ChatId): Promise<void> {
  await client.session.remove({ sessionID: id });
}

export async function isRunning(client: OpenCodeClient, id: ChatId): Promise<boolean> {
  // Lists only the sessions that are running right now.
  const active = await client.session.active();
  return id in active;
}

/** Switches the model, the variant, or both; leaving the variant out resets it. */
export async function switchModel(
  client: OpenCodeClient,
  id: ChatId,
  model: ModelRef,
): Promise<void> {
  await client.session.switchModel({ sessionID: id, model: toWireModel(model) });
}

export function toChatSummary(session: SessionInfo): ChatSummary {
  return {
    id: session.id,
    title: session.title && session.title.length > 0 ? session.title : "Untitled chat",
    updatedAt: session.time?.updated ?? 0,
    model: session.model ? fromWireModel(session.model) : undefined,
  };
}
