/**
 * How a reply is laid out, after T3 Code's chat timeline.
 *
 * Text parts are blocks of their own, and the tool calls and thinking between
 * two of them collapse into one work row ("Searched the web and read 2 web
 * pages"). While the reply runs, everything stays in view and one live row at
 * the end says what it is doing now. Once it settles, everything before the
 * answer folds behind a single "Worked for 14s" row.
 *
 * A form the reply asked is a block of its own: what was asked and what the
 * user answered. It never folds, since it is the user's own input.
 */

import type {
  FormResult,
  Message,
  ReplyPart,
  ToolCall,
  ToolCategory,
  TurnActivity,
  WebSource,
} from "@/src/domain";
import { t } from "@/src/i18n";
import { formatNumber } from "@/src/i18n/format";
import type { IconName } from "@/src/ui/Icon";

export type WorkItem = { type: "tool"; tool: ToolCall } | { type: "reasoning"; text: string };

export type ReplyBlock =
  | { type: "text"; key: string; text: string }
  /** `live` is set on the reply's trailing row while the reply runs; it may have no items yet. */
  | { type: "work"; key: string; items: WorkItem[]; live: TurnActivity | null }
  | { type: "form"; key: string; form: FormResult };

export type WorkBlock = Extract<ReplyBlock, { type: "work" }>;

export interface ReplyLayout {
  /** The blocks before the answer, hidden behind `label` until opened. */
  fold: { label: string; blocks: ReplyBlock[] } | null;
  blocks: ReplyBlock[];
  /** The reply's last text, which is what the copy action copies. */
  answer: string;
}

const WORKING: TurnActivity = { kind: "working" };

function toBlocks(parts: ReplyPart[], showReasoning: boolean, running: boolean): ReplyBlock[] {
  const blocks: ReplyBlock[] = [];
  parts.forEach((part, index) => {
    if (part.type === "text") {
      blocks.push({ type: "text", key: `text-${index}`, text: part.text });
      return;
    }
    if (part.type === "form") {
      // While the run waits on it, the form is the card above the composer.
      if (part.form.status === "waiting" && running) return;
      blocks.push({ type: "form", key: `form-${index}`, form: part.form });
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
  const running = message.status === "pending" || message.status === "streaming";
  const blocks = toBlocks(parts, showReasoning, running);
  const answerIndex = blocks.findLastIndex((block) => block.type === "text");
  const answerBlock = blocks[answerIndex];
  const answer = answerBlock?.type === "text" ? answerBlock.text : "";

  if (running) {
    // Unless it is writing text, a running reply is at least working.
    const live = activity ?? (blocks.at(-1)?.type === "text" ? null : WORKING);
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
    (block) =>
      block.type === "text" ||
      (block.type === "work" && block.items.some((item) => item.type === "tool")),
  );
  if (!foldsWork) return { fold: null, blocks, answer };
  const forms = before.filter((block) => block.type === "form");
  return {
    fold: { label: foldLabel(message), blocks: before.filter((block) => block.type !== "form") },
    blocks: [...forms, ...after],
    answer,
  };
}

function foldLabel(message: Message): string {
  const duration =
    message.completedAt !== undefined
      ? formatDuration(message.completedAt - message.createdAt)
      : null;
  if (message.status === "interrupted") {
    return duration ? t("reply.stoppedAfter", { duration }) : t("reply.stoppedResponse");
  }
  return duration ? t("reply.workedFor", { duration }) : t("reply.worked");
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 1_000) return t("format.seconds", { value: 1 });
  if (ms < 10_000) {
    return t("format.seconds", { value: formatNumber(Math.round(ms / 100) / 10, 1) });
  }
  if (ms < 60_000) return t("format.seconds", { value: Math.round(ms / 1_000) });
  const total = Math.round(ms / 1_000);
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  return [
    hours && t("format.hours", { value: hours }),
    minutes && t("format.minutes", { value: minutes }),
    seconds && t("format.seconds", { value: seconds }),
  ]
    .filter(Boolean)
    .join(" ");
}

const TOOL_ICONS: Record<ToolCategory, IconName> = {
  command: "console-line",
  read: "file-document-outline",
  search: "magnify",
  edit: "pencil-outline",
  "web-search": "web",
  "web-fetch": "web",
  subtask: "source-branch",
  other: "wrench-outline",
};

function toolIcon(category: ToolCategory): IconName {
  return TOOL_ICONS[category];
}

function bareToolLabel(category: ToolCategory, running: boolean): string {
  return running ? t(`reply.tools.${category}.bareRunning`) : t(`reply.tools.${category}.bare`);
}

function bareUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

export function sourceSite(url: string): string {
  return bareUrl(url).split(/[/?#]/)[0];
}

// A live result is parsed for sources before the app knows which tool made
// it, so another call can carry some too; only a search's are real.
export function searchSources(tool: ToolCall): WebSource[] {
  return tool.category === "web-search" ? (tool.sources ?? []) : [];
}

function formatSubject(tool: ToolCall): string {
  if (tool.category === "web-search") return t("format.quoted", { text: tool.subject });
  if (tool.category === "web-fetch") return bareUrl(tool.subject);
  return tool.subject;
}

export function toolLabel(tool: ToolCall): string {
  const running = tool.status === "running";
  const subject = tool.category === "other" ? tool.name : tool.subject && formatSubject(tool);
  if (!subject) return bareToolLabel(tool.category, running);
  return running
    ? t(`reply.tools.${tool.category}.running`, { subject })
    : t(`reply.tools.${tool.category}.done`, { subject });
}

function toolIconFor(tool: ToolCall): IconName {
  return tool.status === "failed" ? "alert-circle-outline" : toolIcon(tool.category);
}

export function workItemIcon(item: WorkItem): IconName {
  return item.type === "tool" ? toolIconFor(item.tool) : "brain";
}

/** How long a reply may wait on the server to start before the row says it is slow. */
export const SLOW_START_MS = 10_000;

function activityRow(activity: TurnActivity, slow: boolean): { icon: IconName; label: string } {
  switch (activity.kind) {
    case "sending":
      return {
        icon: "arrow-up",
        label: slow ? t("reply.activity.slowStart") : t("reply.activity.sending"),
      };
    case "working":
      return { icon: "creation", label: t("reply.activity.working") };
    case "thinking":
      return { icon: "brain", label: t("reply.activity.thinking") };
    case "tool":
      return {
        icon: toolIcon(activity.category),
        label:
          activity.category === "other" && activity.name
            ? t("reply.tools.other.running", { subject: activity.name })
            : bareToolLabel(activity.category, true),
      };
    case "asking":
      return { icon: "comment-question-outline", label: t("reply.activity.asking") };
    case "retrying":
      return {
        icon: "refresh",
        label:
          activity.attempt > 1
            ? t("reply.activity.retryingAttempt", { attempt: activity.attempt })
            : t("reply.activity.retrying"),
      };
    case "compacting":
      return { icon: "archive-arrow-down-outline", label: t("reply.activity.compacting") };
  }
}

function summarizeTools(tools: ToolCall[]): string {
  const counts = new Map<ToolCategory, number>();
  for (const tool of tools) counts.set(tool.category, (counts.get(tool.category) ?? 0) + 1);
  const phrases = [...counts].map(([category, count]) =>
    t(`reply.tools.${category}.count`, { count }),
  );
  const sentence = phrases.map((phrase, index) =>
    index === 0 ? phrase : phrase.charAt(0).toLowerCase() + phrase.slice(1),
  );
  if (sentence.length < 2) return sentence[0] ?? "";
  return t("format.listAnd", {
    list: sentence.slice(0, -1).join(", "),
    last: sentence[sentence.length - 1],
  });
}

/**
 * The icon and one-line label of a work row. `slow`: the reply has waited on
 * the server longer than `SLOW_START_MS`.
 */
export function workRow(block: WorkBlock, slow = false): { icon: IconName; label: string } {
  const tools = block.items.flatMap((item) => (item.type === "tool" ? [item.tool] : []));
  if (block.live) {
    // The call still going says more than the generic activity does.
    const running = tools.findLast((tool) => tool.status === "running");
    if (running && block.live.kind === "tool") {
      return { icon: toolIcon(running.category), label: toolLabel(running) };
    }
    return activityRow(block.live, slow);
  }
  if (tools.length === 0) {
    const thoughts = block.items.length;
    return {
      icon: "brain",
      label: thoughts > 1 ? t("reply.thoughtTimes", { count: thoughts }) : t("reply.thought"),
    };
  }
  const categories = new Set(tools.map((tool) => tool.category));
  const icon = categories.size === 1 ? toolIcon(tools[0].category) : "wrench-outline";
  return { icon, label: tools.length === 1 ? toolLabel(tools[0]) : summarizeTools(tools) };
}
