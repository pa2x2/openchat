import {
  addTotals,
  localDay,
  totalTokens,
  type ModelInfo,
  type UsageQuery,
  type UsageReport,
  type UsageTotals,
} from "@/src/domain";
import { formatCost, formatTokens, formatTokensShort } from "@/src/features/chat/usageFormat";
import { formatMonthDay, formatTimestamp, formatWeekday } from "@/src/lib/time";
import { modelKey, sameModelRef } from "@/src/stores/models";
import type { UsageMeasure, UsagePeriod } from "@/src/stores/settings";

export const PERIODS: { value: UsagePeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All time" },
];

export const MEASURES: { value: UsageMeasure; label: string }[] = [
  { value: "tokens", label: "Tokens" },
  { value: "cost", label: "Cost" },
  { value: "requests", label: "Requests" },
];

/** Calendar days in a period, today included; null for all time. */
const PERIOD_DAYS: Record<UsagePeriod, number | null> = { today: 1, "7d": 7, "30d": 30, all: null };

function dayStart(now: Date, daysAgo: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);
}

/** Days are asked for only where there is more than one to chart. */
export function periodQuery(period: UsagePeriod, now = new Date()): UsageQuery {
  const days = PERIOD_DAYS[period];
  if (days === null) return {};
  return { from: dayStart(now, days - 1).getTime(), daily: days > 1 };
}

export function measured(totals: UsageTotals, measure: UsageMeasure): number {
  if (measure === "tokens") return totals.usage ? totalTokens(totals.usage) : 0;
  if (measure === "cost") return totals.cost?.amount ?? 0;
  return totals.requests ?? 0;
}

/** A total as a bare figure; null for a cost nothing was priced at. */
export function formatMeasured(totals: UsageTotals, measure: UsageMeasure): string | null {
  if (measure === "cost") return formatCost(totals.cost);
  const count = measured(totals, measure);
  return measure === "tokens" ? formatTokensShort(count) : formatTokens(count);
}

/** A total with its unit, as a sentence would have it. */
function describeMeasured(totals: UsageTotals, measure: UsageMeasure): string | null {
  const figure = formatMeasured(totals, measure);
  if (figure === null || measure === "cost") return figure;
  if (measure === "tokens") return `${figure} tokens`;
  return measured(totals, measure) === 1 ? "1 request" : `${figure} requests`;
}

export interface ChartDay {
  date: string;
  /** The day in full, such as "Wed, Sep 23". */
  label: string;
  weekday: string;
  monthDay: string;
  /** Null on a day nothing was used. */
  totals: UsageTotals | null;
}

/** Every day of a period, used or not, oldest first; null for a period that has no chart. */
export function chartDays(
  report: UsageReport,
  period: UsagePeriod,
  now = new Date(),
): ChartDay[] | null {
  const count = PERIOD_DAYS[period];
  if (count === null || count < 2) return null;
  const used = new Map(report.days.map((day) => [day.date, day]));
  return Array.from({ length: count }, (_, index) => {
    const day = dayStart(now, count - 1 - index);
    const date = localDay(day.getTime());
    const weekday = formatWeekday(day);
    const monthDay = formatMonthDay(day);
    return {
      date,
      label: `${weekday}, ${monthDay}`,
      weekday,
      monthDay,
      totals: used.get(date) ?? null,
    };
  });
}

/**
 * The value the chart's top gridline stands for: the first of 2, 4 and 10
 * times a power of ten that holds the largest bar. Half of each is a round
 * figure too, which the middle gridline needs.
 */
export function chartTop(max: number): number {
  if (!(max > 0)) return 2;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return [2, 4, 10].map((step) => step * magnitude).find((top) => max <= top) ?? 10 * magnitude;
}

export function formatTick(value: number, measure: UsageMeasure, currency: string): string {
  if (value === 0) return "0";
  if (measure === "cost") return formatCost({ amount: value, currency }) ?? "0";
  return measure === "tokens" ? formatTokensShort(value) : formatTokens(value);
}

/** What a tap on a day shows: the charted figure first, then the day and its other figures. */
export function dayReadout(day: ChartDay, measure: UsageMeasure): { lead: string; rest: string } {
  if (!day.totals) return { lead: "Nothing used", rest: day.label };
  const { totals } = day;
  const others = MEASURES.filter((each) => each.value !== measure)
    .map((each) => describeMeasured(totals, each.value))
    .filter((text) => text !== null);
  return {
    lead: describeMeasured(totals, measure) ?? "No cost",
    rest: [day.label, ...others].join(" · "),
  };
}

export interface ModelRow {
  key: string;
  label: string;
  provider: string;
  value: string | null;
}

/**
 * One row per model, largest first by the chosen measure. A report lists a
 * model once per variant it ran with; those are added together here.
 */
export function modelRows(
  report: UsageReport,
  catalog: ModelInfo[],
  measure: UsageMeasure,
): ModelRow[] {
  const byModel = new Map<string, UsageReport["models"][number]>();
  for (const row of report.models) {
    const key = modelKey(row.model);
    const seen = byModel.get(key);
    byModel.set(key, seen ? { ...addTotals(seen, row), model: seen.model } : row);
  }
  return [...byModel.entries()]
    .sort(([, a], [, b]) => measured(b, measure) - measured(a, measure))
    .map(([key, row]) => {
      const info = catalog.find((model) => sameModelRef(model.ref, row.model));
      return {
        key,
        label: info?.label ?? row.model.id,
        provider: info?.providerLabel ?? row.model.provider,
        value: formatMeasured(row, measure),
      };
    });
}

function counted(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${formatTokens(count)} ${many}`;
}

export function summaryLine(report: UsageReport, period: UsagePeriod, now = new Date()): string {
  const parts: string[] = [];
  if (report.chats !== undefined) parts.push(counted(report.chats, "chat", "chats"));
  if (report.prompts !== undefined) parts.push(counted(report.prompts, "message", "messages"));
  const days = PERIOD_DAYS[period];
  if (days === null) {
    if (report.from !== undefined) parts.push(`since ${formatTimestamp(report.from, now)}`);
  } else if (days > 1) {
    parts.push(`${report.days.length} of ${days} days`);
  }
  return parts.join(" · ");
}
