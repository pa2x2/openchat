import type { Message, Money, TokenUsage, UsageQuery, UsageReport, UsageTotals } from "./types";

const BUCKETS = ["input", "output", "reasoning", "cacheRead", "cacheWrite"] as const;

/** A bucket neither side reports stays unset rather than becoming a zero. */
export function addUsage(a?: TokenUsage, b?: TokenUsage): TokenUsage | undefined {
  if (!a || !b) return a ?? b;
  const sum: TokenUsage = {};
  for (const bucket of BUCKETS) {
    if (a[bucket] === undefined && b[bucket] === undefined) continue;
    sum[bucket] = (a[bucket] ?? 0) + (b[bucket] ?? 0);
  }
  return sum;
}

export function totalTokens(usage: TokenUsage): number {
  return BUCKETS.reduce((total, bucket) => total + (usage[bucket] ?? 0), 0);
}

/** Both amounts must be in one currency, as the parts of one reply are. */
export function addCost(a?: Money, b?: Money): Money | undefined {
  if (!a || !b) return a ?? b;
  return { amount: a.amount + b.amount, currency: a.currency };
}

function addCounts(a?: number, b?: number): number | undefined {
  return a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);
}

export function addTotals(a: UsageTotals, b: UsageTotals): UsageTotals {
  return {
    requests: addCounts(a.requests, b.requests),
    usage: addUsage(a.usage, b.usage),
    cost: addCost(a.cost, b.cost),
  };
}

/** The calendar day a moment falls on where the device is: "2026-09-30". */
export function localDay(time: number): string {
  const date = new Date(time);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function mergeBy<T extends UsageTotals>(rows: T[], key: (row: T) => string): T[] {
  const merged = new Map<string, T>();
  for (const row of rows) {
    const seen = merged.get(key(row));
    merged.set(key(row), seen ? { ...row, ...addTotals(seen, row) } : row);
  }
  return [...merged.values()];
}

function mergeModels(rows: UsageReport["models"]): UsageReport["models"] {
  return mergeBy(rows, ({ model }) => `${model.provider}/${model.id}/${model.variant ?? ""}`);
}

function mergeDays(rows: UsageReport["days"]): UsageReport["days"] {
  return mergeBy(rows, (day) => day.date).sort((a, b) => a.date.localeCompare(b.date));
}

/** One report for what two count apart, such as a backend's and the app's own. */
export function mergeReports(a: UsageReport, b: UsageReport): UsageReport {
  return {
    ...addTotals(a, b),
    from:
      a.from === undefined || b.from === undefined ? (a.from ?? b.from) : Math.min(a.from, b.from),
    chats: addCounts(a.chats, b.chats),
    prompts: addCounts(a.prompts, b.prompts),
    models: mergeModels([...a.models, ...b.models]),
    days: mergeDays([...a.days, ...b.days]),
  };
}

/** What a usage report needs of a message. */
export type UsageEntry = Pick<
  Message,
  "role" | "createdAt" | "model" | "usage" | "cost" | "requests"
>;

/**
 * The report of what the given chats used in a span, counted the way a
 * backend counts its own: a chat counts when a reply of it falls in the span,
 * and a reply counts on the day it started.
 */
export function transcriptUsage(
  transcripts: readonly (readonly UsageEntry[])[],
  { from = -Infinity, to = Infinity }: UsageQuery,
): UsageReport {
  let totals: UsageTotals = {};
  let first: number | undefined;
  let chats = 0;
  let prompts = 0;
  const models: UsageReport["models"] = [];
  const days: UsageReport["days"] = [];
  for (const transcript of transcripts) {
    let used = false;
    for (const entry of transcript) {
      if (entry.createdAt < from || entry.createdAt >= to) continue;
      if (entry.role === "user") {
        prompts += 1;
        continue;
      }
      if (!entry.usage) continue;
      used = true;
      const counted = addTotals({}, entry);
      totals = addTotals(totals, counted);
      first = Math.min(first ?? entry.createdAt, entry.createdAt);
      if (entry.model) models.push({ ...counted, model: entry.model });
      days.push({ ...counted, date: localDay(entry.createdAt) });
    }
    if (used) chats += 1;
  }
  return {
    ...totals,
    from: first,
    chats,
    prompts,
    models: mergeModels(models),
    days: mergeDays(days),
  };
}
