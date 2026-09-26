import type {
  PromptFileAttachment,
  SessionMessageAssistant,
  SessionMessageIdle,
  SessionMessageInfo,
  SessionMessageUser,
} from "@opencode/client";
import type { Attachment, ChatId, Message, MessageStatus, ReplyPart } from "@/src/domain";
import type { OpenCodeClient } from "./client";
import { toolCategory, toolSubject } from "./normalize";

export async function fetchMessages(client: OpenCodeClient, chatId: ChatId): Promise<Message[]> {
  const response = await client.message.list({ sessionID: chatId });
  return toMessages(response.data);
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

/**
 * The server stores a run as one assistant entry per model step: one that
 * calls tools, the next that reads their results, and so on, closed by an
 * idle entry. The app shows one reply per prompt, so a run's steps merge.
 */
export function toMessages(wire: readonly SessionMessageInfo[]): Message[] {
  // The server lists newest first.
  const ordered = [...wire].sort((a, b) => a.time.created - b.time.created);
  const messages: Message[] = [];
  let steps: SessionMessageAssistant[] = [];
  const closeRun = (idle?: SessionMessageIdle) => {
    const reply = toReply(steps, idle);
    if (reply) messages.push(reply);
    steps = [];
  };
  for (const entry of ordered) {
    if (entry.type === "assistant") {
      steps.push(entry);
    } else if (entry.type === "idle") {
      closeRun(entry);
    } else if (entry.type === "user") {
      closeRun();
      messages.push(toUserMessage(entry));
    }
    // Other entries (model switches, compaction, …) are not chat messages.
  }
  closeRun();
  return messages;
}

function toUserMessage(wire: SessionMessageUser): Message {
  return {
    id: wire.id,
    role: "user",
    text: wire.text,
    status: "complete",
    createdAt: wire.time.created,
    ...(wire.files && wire.files.length > 0 ? { attachments: wire.files.map(toAttachment) } : {}),
  };
}

function toParts(step: SessionMessageAssistant): ReplyPart[] {
  const parts: ReplyPart[] = [];
  for (const part of step.content) {
    if (part.type === "tool") {
      const { state } = part;
      parts.push({
        type: "tool",
        tool: {
          id: part.id,
          name: part.name,
          category: toolCategory(part.name),
          // Still a raw string while the model is writing it.
          subject: typeof state.input === "string" ? "" : toolSubject(state.input),
          status:
            state.status === "completed" ? "done" : state.status === "error" ? "failed" : "running",
        },
      });
    } else if (part.text.trim().length > 0) {
      parts.push({ type: part.type, text: part.text });
    }
  }
  return parts;
}

function toReply(steps: SessionMessageAssistant[], idle?: SessionMessageIdle): Message | null {
  const first = steps[0];
  const last = steps.at(-1);
  if (!first || !last) return null;
  const parts = steps.flatMap(toParts);
  const completed = last.time.completed;
  // A finished run that produced nothing left an empty entry behind (it
  // happens when a message is steered into a session that is still busy).
  // It is not something the user can read.
  if (typeof completed === "number" && parts.length === 0) return null;
  let status: MessageStatus = completed ? "complete" : last.error ? "error" : "interrupted";
  if (idle?.outcome === "interrupted") status = "interrupted";
  if (idle?.outcome === "failed") status = "error";
  const completedAt = idle?.time.created ?? completed;
  return {
    id: first.id,
    role: "assistant",
    text: parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n\n"),
    parts,
    status,
    // The last step saw the whole conversation, so its usage is the run's.
    usage: last.tokens
      ? {
          input: last.tokens.input,
          output: last.tokens.output,
          reasoning: last.tokens.reasoning,
          cacheRead: last.tokens.cache?.read,
          cacheWrite: last.tokens.cache?.write,
        }
      : undefined,
    createdAt: first.time.created,
    ...(completedAt !== undefined ? { completedAt } : {}),
  };
}
