import type { TFunction } from "i18next";
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
import { formatNumber } from "@/src/i18n/format";
import { formatMonthDay, formatTimestamp, formatWeekday } from "@/src/lib/time";
import { modelKey, sameModelRef } from "@/src/stores/models";
import type { UsageMeasure, UsagePeriod } from "@/src/stores/settings";

export const PERIODS: UsagePeriod[] = ["today", "7d", "30d", "all"];

export const MEASURES: UsageMeasure[] = ["tokens", "cost", "requests"];

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
export function formatMeasured(
  t: TFunction,
  totals: UsageTotals,
  measure: UsageMeasure,
): string | null {
  if (measure === "cost") return formatCost(t, totals.cost);
  const count = measured(totals, measure);
  return measure === "tokens" ? formatTokensShort(t, count) : formatTokens(t, count);
}

/** A total with its unit, as a sentence would have it. */
function describeMeasured(t: TFunction, totals: UsageTotals, measure: UsageMeasure): string | null {
  const figure = formatMeasured(t, totals, measure);
  if (figure === null || measure === "cost") return figure;
  if (measure === "tokens") return t("context.tokenCount", { tokens: figure });
  return t("usage.requests", { count: measured(totals, measure), formatted: figure });
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
  t: TFunction,
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
    const weekday = formatWeekday(t, day);
    const monthDay = formatMonthDay(t, day);
    return {
      date,
      label: t("time.weekdayDate", { weekday, date: monthDay }),
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

export function formatTick(
  t: TFunction,
  value: number,
  measure: UsageMeasure,
  currency: string,
): string {
  if (value === 0) return "0";
  if (measure === "cost") return formatCost(t, { amount: value, currency }) ?? "0";
  if (measure !== "tokens") return formatTokens(t, value);
  // From a million up every tick is a whole number of them (see chartTop), so
  // the two decimals formatTokensShort gives millions would only be zeros.
  if (value >= 1_000_000) return `${formatNumber(t, value / 1_000_000)}M`;
  return formatTokensShort(t, value);
}

/** What a tap on a day shows: the charted figure first, then the day and its other figures. */
export function dayReadout(
  t: TFunction,
  day: ChartDay,
  measure: UsageMeasure,
): { lead: string; rest: string } {
  if (!day.totals) return { lead: t("usage.nothingUsed"), rest: day.label };
  const { totals } = day;
  const others = MEASURES.filter((each) => each !== measure)
    .map((each) => describeMeasured(t, totals, each))
    .filter((text) => text !== null);
  return {
    lead: describeMeasured(t, totals, measure) ?? t("usage.noCost"),
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
  t: TFunction,
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
        value: formatMeasured(t, row, measure),
      };
    });
}

export function summaryLine(
  t: TFunction,
  report: UsageReport,
  period: UsagePeriod,
  now = new Date(),
): string {
  const parts: string[] = [];
  if (report.chats !== undefined) {
    parts.push(t("usage.chats", { count: report.chats, formatted: formatTokens(t, report.chats) }));
  }
  if (report.prompts !== undefined) {
    parts.push(
      t("usage.messages", { count: report.prompts, formatted: formatTokens(t, report.prompts) }),
    );
  }
  const days = PERIOD_DAYS[period];
  if (days === null) {
    if (report.from !== undefined) {
      parts.push(t("usage.since", { time: formatTimestamp(t, report.from, now) }));
    }
  } else if (days > 1) {
    parts.push(t("usage.daysOf", { count: days, used: report.days.length }));
  }
  return parts.join(" · ");
}
