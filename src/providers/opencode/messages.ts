/**
 * Message history fetch (reconciliation / cold open) against the OpenCode
 * V2 API.
 */

import type { PromptFileAttachment, SessionMessageInfo } from "@opencode/client";
import type { Attachment, ChatId, Message } from "@/src/domain";
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

/** Decoded length of a base64 payload, without decoding it. */
function base64ByteLength(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function toAttachment(file: PromptFileAttachment): Attachment {
  // The server hands the payload back itself, whether the file was sent
  // inline or fetched from a uri, so a transcript read back from the server
  // can render an attachment without a second request.
  const bytes = file.data.length > 0 ? file.data : undefined;
  return {
    uri: "",
    mimeType: file.mime || "application/octet-stream",
    name: file.name ?? "attachment",
    ...(bytes ? { bytes, size: base64ByteLength(bytes) } : {}),
  };
}

export function toMessage(wire: SessionMessageInfo): Message | null {
  if (wire.type === "user") {
    return {
      id: wire.id,
      role: "user",
      text: wire.text,
      status: "complete",
      createdAt: wire.time.created,
      ...(wire.files && wire.files.length > 0 ? { attachments: wire.files.map(toAttachment) } : {}),
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
    // A finished run that produced neither text nor reasoning left an empty
    // assistant entry behind (it happens when a message is steered into a
    // session that is still busy). It is not something the user can read.
    if (completed && text.length === 0 && reasoning.length === 0) return null;
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
