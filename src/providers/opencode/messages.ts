import type {
  PromptFileAttachment,
  SessionMessageAssistant,
  SessionMessageIdle,
  SessionMessageInfo,
  SessionMessageUser,
} from "@opencode/client";
import {
  addCost,
  addUsage,
  totalTokens,
  type Attachment,
  type ChatId,
  type FormResult,
  type Message,
  type MessageStatus,
  type ReplyPart,
} from "@/src/domain";
import type { OpenCodeClient } from "./client";
import { fromWireModel } from "./sessions";
import { toCost, toTokenUsage } from "./usage";
import {
  QUESTION_TOOL,
  askedQuestions,
  givenAnswers,
  isDismissal,
  toolCategory,
  toolSubject,
} from "./normalize";

// The server rejects anything above 200, and without a limit it pages at 50.
const PAGE_SIZE = 200;

export async function fetchMessages(client: OpenCodeClient, chatId: ChatId): Promise<Message[]> {
  const wire: SessionMessageInfo[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.message.list({ sessionID: chatId, limit: PAGE_SIZE, cursor });
    wire.push(...page.data);
    cursor = page.data.length > 0 ? (page.cursor.next ?? undefined) : undefined;
  } while (cursor);
  return toMessages(wire);
}

/** Decoded length of a base64 payload, without decoding it. */
function base64ByteLength(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export function toAttachment(file: PromptFileAttachment): Attachment {
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
    } else if (entry.type === "compaction" && entry.status === "completed") {
      // The summary replaced the context these replies measured.
      for (const message of messages) delete message.contextTokens;
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

type WireTool = Extract<SessionMessageAssistant["content"][number], { type: "tool" }>;

/**
 * A `question` call as the form it raised. Null when it never got as far as
 * asking (its input is still being written, or it failed some other way);
 * the call then shows as any other tool does.
 */
function toFormResult(part: WireTool): FormResult | null {
  const { state } = part;
  if (part.name !== QUESTION_TOOL || state.status === "streaming") return null;
  const questions = askedQuestions(state.input);
  if (!questions) return null;
  if (state.status === "completed") {
    const answers = givenAnswers(state.metadata);
    return answers ? { id: part.id, status: "answered", questions, answers } : null;
  }
  if (state.status === "error") {
    return isDismissal(state.error)
      ? { id: part.id, status: "dismissed", questions, answers: [] }
      : null;
  }
  return { id: part.id, status: "waiting", questions, answers: [] };
}

function toParts(step: SessionMessageAssistant): ReplyPart[] {
  const parts: ReplyPart[] = [];
  for (const part of step.content) {
    if (part.type === "tool") {
      const form = toFormResult(part);
      if (form) {
        parts.push({ type: "form", form });
        continue;
      }
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
    ...toStats(steps),
    ...(last.model ? { model: fromWireModel(last.model) } : {}),
    createdAt: first.time.created,
    ...(completedAt !== undefined ? { completedAt } : {}),
  };
}

type ReplyStats = Pick<Message, "usage" | "requests" | "cost" | "contextTokens" | "generationMs">;

function toStats(steps: SessionMessageAssistant[]): ReplyStats {
  const stats: ReplyStats = {};
  let generationMs: number | undefined = 0;
  for (const step of steps) {
    const usage = toTokenUsage(step.tokens);
    if (!usage) continue;
    stats.usage = addUsage(stats.usage, usage);
    stats.requests = (stats.requests ?? 0) + 1;
    stats.cost = addCost(stats.cost, toCost(step.cost));
    // Every step reads the whole conversation again, so the last count is the context's size.
    stats.contextTokens = totalTokens(usage);
    // `streamed` is when the model stopped writing; the step stays open while its tools run.
    const { created, streamed } = step.time;
    generationMs =
      generationMs !== undefined && streamed !== undefined
        ? generationMs + streamed - created
        : undefined;
  }
  if (stats.usage && generationMs !== undefined) stats.generationMs = generationMs;
  return stats;
}
