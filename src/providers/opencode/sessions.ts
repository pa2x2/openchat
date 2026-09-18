/**
 * Session (chat) operations against the OpenCode V2 API.
 */

import type { SessionInfo } from "@opencode/client";
import type { ChatId, ChatSummary } from "@/src/domain";
import type { OpenCodeClient } from "./client";

export async function listChats(client: OpenCodeClient): Promise<ChatSummary[]> {
  const response = await client.session.list({ limit: 100, order: "desc" });
  return response.data.filter((session) => !session.time?.archived).map(toChatSummary);
}

export async function createChat(
  client: OpenCodeClient,
  opts?: { model?: { provider: string; id: string }; title?: string },
): Promise<ChatSummary> {
  const session = await client.session.create({
    title: opts?.title ?? null,
    ...(opts?.model ? { model: { providerID: opts.model.provider, id: opts.model.id } } : {}),
  });
  return toChatSummary(session);
}

export async function deleteChat(client: OpenCodeClient, id: ChatId): Promise<void> {
  await client.session.remove({ sessionID: id });
}

export function toChatSummary(session: SessionInfo): ChatSummary {
  return {
    id: session.id,
    title: session.title && session.title.length > 0 ? session.title : "Untitled chat",
    updatedAt: session.time?.updated ?? 0,
    model: session.model ? { provider: session.model.providerID, id: session.model.id } : undefined,
  };
}
