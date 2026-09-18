/**
 * Message history fetch (reconciliation / cold open) against the OpenCode
 * V2 API.
 */

import type { SessionMessageInfo } from "@opencode/client";
import type { ChatId, Message } from "@/src/domain";
import type { OpenCodeClient } from "./client";

export async function fetchMessages(client: OpenCodeClient, chatId: ChatId): Promise<Message[]> {
  const response = await client.message.list({ sessionID: chatId });
  const messages: Message[] = [];
  for (const wire of response.data) {
    const mapped = toMessage(wire);
    if (mapped) messages.push(mapped);
  }
  return messages;
}

export function toMessage(wire: SessionMessageInfo): Message | null {
  if (wire.type === "user") {
    return {
      id: wire.id,
      role: "user",
      text: wire.text,
      status: "complete",
      createdAt: wire.time.created,
      attachments: wire.files?.map((file) => ({
        uri: file.source.type === "uri" ? file.source.uri : "",
        mimeType: file.mime,
        name: file.name ?? "attachment",
      })),
    };
  }
  if (wire.type === "assistant") {
    const text = wire.content
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .filter((text) => text.length > 0)
      .join("\n\n");
    const reasoning = wire.content
      .filter((part): part is { type: "reasoning"; text: string } => part.type === "reasoning")
      .map((part) => part.text)
      .join("\n\n");
    const completed = typeof wire.time.completed === "number";
    return {
      id: wire.id,
      role: "assistant",
      text,
      ...(reasoning.length > 0 ? { reasoning } : {}),
      status: completed ? "complete" : wire.error ? "error" : "interrupted",
      usage: wire.tokens
        ? {
            input: wire.tokens.input,
            output: wire.tokens.output,
            reasoning: wire.tokens.reasoning,
            cacheRead: wire.tokens.cache?.read,
            cacheWrite: wire.tokens.cache?.write,
          }
        : undefined,
      createdAt: wire.time.created,
    };
  }
  return null; // idle/synthetic/system/… entries are not chat messages
}
