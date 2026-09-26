/**
 * How a reply is laid out, after T3 Code's chat timeline.
 *
 * Text parts are blocks of their own, and the tool calls and thinking between
 * two of them collapse into one work row ("Searched the web and read 2 web
 * pages"). While the reply runs, everything stays in view and one live row at
 * the end says what it is doing now. Once it settles, everything before the
 * answer folds behind a single "Worked for 14s" row.
 */

import type { Message, ReplyPart, ToolCall, ToolCategory, TurnActivity } from "@/src/domain";
import type { IconName } from "@/src/ui/Icon";

export type WorkItem = { type: "tool"; tool: ToolCall } | { type: "reasoning"; text: string };

export type ReplyBlock =
  | { type: "text"; key: string; text: string }
  /** `live` is set on the reply's trailing row while the reply runs; it may have no items yet. */
  | { type: "work"; key: string; items: WorkItem[]; live: TurnActivity | null };

export type WorkBlock = Extract<ReplyBlock, { type: "work" }>;

export interface ReplyLayout {
  /** The blocks before the answer, hidden behind `label` until opened. */
  fold: { label: string; blocks: ReplyBlock[] } | null;
  blocks: ReplyBlock[];
  /** The reply's last text, which is what the copy action copies. */
  answer: string;
}

const THINKING: TurnActivity = { kind: "thinking" };

function toBlocks(parts: ReplyPart[], showReasoning: boolean): ReplyBlock[] {
  const blocks: ReplyBlock[] = [];
  parts.forEach((part, index) => {
    if (part.type === "text") {
      blocks.push({ type: "text", key: `text-${index}`, text: part.text });
      return;
    }
    if (part.type === "reasoning" && !showReasoning) return;
    const item: WorkItem =
      part.type === "tool"
        ? { type: "tool", tool: part.tool }
        : { type: "reasoning", text: part.text };
    const last = blocks.at(-1);
    if (last?.type === "work") last.items.push(item);
    else blocks.push({ type: "work", key: `work-${index}`, items: [item], live: null });
  });
  return blocks;
}

export function layoutReply(
  message: Message,
  { showReasoning, activity }: { showReasoning: boolean; activity: TurnActivity | null },
): ReplyLayout {
  const parts: ReplyPart[] =
    message.parts ?? (message.text ? [{ type: "text", text: message.text }] : []);
  const blocks = toBlocks(parts, showReasoning);
  const answerIndex = blocks.findLastIndex((block) => block.type === "text");
  const answerBlock = blocks[answerIndex];
  const answer = answerBlock?.type === "text" ? answerBlock.text : "";

  if (message.status === "pending" || message.status === "streaming") {
    // Unless it is writing text, a running reply is at least thinking.
    const live = activity ?? (blocks.at(-1)?.type === "text" ? null : THINKING);
    if (live) {
      const last = blocks.at(-1);
      if (last?.type === "work") last.live = live;
      else blocks.push({ type: "work", key: "live", items: [], live });
    }
    return { fold: null, blocks, answer };
  }

  // Blocks after the answer (calls it made once it had written it) stay below it.
  const before = answerIndex >= 0 ? blocks.slice(0, answerIndex) : blocks;
  const after = answerIndex >= 0 ? blocks.slice(answerIndex) : [];
  // Thinking alone is not worth a fold: it keeps its own "Thought" row.
  const foldsWork = before.some(
    (block) => block.type === "text" || block.items.some((item) => item.type === "tool"),
  );
  if (!foldsWork) return { fold: null, blocks, answer };
  return { fold: { label: foldLabel(message), blocks: before }, blocks: after, answer };
}

function foldLabel(message: Message): string {
  const duration =
    message.completedAt !== undefined
      ? formatDuration(message.completedAt - message.createdAt)
      : null;
  if (message.status === "interrupted") {
    return duration ? `You stopped after ${duration}` : "You stopped this response";
  }
  return duration ? `Worked for ${duration}` : "Worked";
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 1_000) return "1s";
  if (ms < 10_000) return `${(Math.round(ms / 100) / 10).toFixed(1)}s`;
  if (ms < 60_000) return `${Math.round(ms / 1_000)}s`;
  const total = Math.round(ms / 1_000);
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  return [hours && `${hours}h`, minutes && `${minutes}m`, seconds && `${seconds}s`]
    .filter(Boolean)
    .join(" ");
}

interface ToolWords {
  icon: IconName;
  /** Verbs placed before the call's subject: [while running, once done]. */
  verbs: [string, string];
  /** Stand-ins for a call whose subject is unknown: [while running, once done]. */
  bare: [string, string];
  count: (n: number) => string;
}

const TOOLS: Record<Exclude<ToolCategory, "other">, ToolWords> = {
  command: {
    icon: "console-line",
    verbs: ["Running", "Ran"],
    bare: ["Running a command", "Ran a command"],
    count: (n) => (n === 1 ? "Ran a command" : `Ran ${n} commands`),
  },
  read: {
    icon: "file-document-outline",
    verbs: ["Reading", "Read"],
    bare: ["Reading files", "Read a file"],
    count: (n) => (n === 1 ? "Read a file" : `Read ${n} files`),
  },
  search: {
    icon: "magnify",
    verbs: ["Searching for", "Searched for"],
    bare: ["Searching files", "Searched files"],
    count: (n) => (n === 1 ? "Searched files" : `Searched files ${n} times`),
  },
  edit: {
    icon: "pencil-outline",
    verbs: ["Editing", "Edited"],
    bare: ["Editing files", "Edited a file"],
    count: (n) => (n === 1 ? "Edited a file" : `Edited ${n} files`),
  },
  "web-search": {
    icon: "web",
    verbs: ["Searching the web for", "Searched the web for"],
    bare: ["Searching the web", "Searched the web"],
    count: (n) => (n === 1 ? "Searched the web" : `Searched the web ${n} times`),
  },
  "web-fetch": {
    icon: "web",
    verbs: ["Reading", "Read"],
    bare: ["Reading a web page", "Read a web page"],
    count: (n) => (n === 1 ? "Read a web page" : `Read ${n} web pages`),
  },
  subtask: {
    icon: "source-branch",
    verbs: ["Running", "Ran"],
    bare: ["Running a subtask", "Ran a subtask"],
    count: (n) => (n === 1 ? "Ran a subtask" : `Ran ${n} subtasks`),
  },
};

function toolIcon(category: ToolCategory): IconName {
  return category === "other" ? "wrench-outline" : TOOLS[category].icon;
}

function formatSubject(tool: ToolCall): string {
  if (tool.category === "web-search") return `“${tool.subject}”`;
  if (tool.category === "web-fetch") {
    return tool.subject.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  }
  return tool.subject;
}

export function toolLabel(tool: ToolCall): string {
  const tense = tool.status === "running" ? 0 : 1;
  if (tool.category === "other") {
    const verb = tense === 0 ? "Using" : "Used";
    return tool.name ? `${verb} ${tool.name}` : `${verb} a tool`;
  }
  const words = TOOLS[tool.category];
  return tool.subject ? `${words.verbs[tense]} ${formatSubject(tool)}` : words.bare[tense];
}

function toolIconFor(tool: ToolCall): IconName {
  return tool.status === "failed" ? "alert-circle-outline" : toolIcon(tool.category);
}

export function workItemIcon(item: WorkItem): IconName {
  return item.type === "tool" ? toolIconFor(item.tool) : "brain";
}

function activityRow(activity: TurnActivity): { icon: IconName; label: string } {
  switch (activity.kind) {
    case "thinking":
      return { icon: "brain", label: "Thinking" };
    case "tool":
      return {
        icon: toolIcon(activity.category),
        label:
          activity.category !== "other"
            ? TOOLS[activity.category].bare[0]
            : activity.name
              ? `Using ${activity.name}`
              : "Using a tool",
      };
    case "retrying":
      return {
        icon: "refresh",
        label: activity.attempt > 1 ? `Retrying (attempt ${activity.attempt})` : "Retrying",
      };
    case "compacting":
      return { icon: "archive-arrow-down-outline", label: "Compacting the conversation" };
  }
}

function summarizeTools(tools: ToolCall[]): string {
  const counts = new Map<ToolCategory, number>();
  for (const tool of tools) counts.set(tool.category, (counts.get(tool.category) ?? 0) + 1);
  const phrases = [...counts].map(([category, n]) =>
    category === "other" ? (n === 1 ? "Used a tool" : `Used ${n} tools`) : TOOLS[category].count(n),
  );
  const sentence = phrases.map((phrase, index) =>
    index === 0 ? phrase : phrase.charAt(0).toLowerCase() + phrase.slice(1),
  );
  if (sentence.length < 2) return sentence[0] ?? "";
  return `${sentence.slice(0, -1).join(", ")} and ${sentence.at(-1)}`;
}

/** The icon and one-line label of a work row. */
export function workRow(block: WorkBlock): { icon: IconName; label: string } {
  const tools = block.items.flatMap((item) => (item.type === "tool" ? [item.tool] : []));
  if (block.live) {
    // The call still going says more than the generic activity does.
    const running = tools.findLast((tool) => tool.status === "running");
    if (running && block.live.kind === "tool") {
      return { icon: toolIcon(running.category), label: toolLabel(running) };
    }
    return activityRow(block.live);
  }
  if (tools.length === 0) {
    const thoughts = block.items.length;
    return { icon: "brain", label: thoughts > 1 ? `Thought (×${thoughts})` : "Thought" };
  }
  const categories = new Set(tools.map((tool) => tool.category));
  const icon = categories.size === 1 ? toolIcon(tools[0].category) : "wrench-outline";
  return { icon, label: tools.length === 1 ? toolLabel(tools[0]) : summarizeTools(tools) };
}
