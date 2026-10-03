/**
 * How the statistics are written. A figure the backend did not send has no
 * text here: the functions return null or leave the row out, and the UI shows
 * nothing in its place.
 */

import type { TFunction } from "i18next";
import type { Money, TokenUsage } from "@/src/domain";
import { formatNumber } from "@/src/i18n/format";
import { formatDuration } from "./replyLayout";

export function formatTokens(t: TFunction, count: number): string {
  return formatNumber(t, count);
}

/**
 * Tokens where room is tight: `842`, `48.6k`, `128k`, `1.42M`. Each range is
 * picked from the rounded figure, so a count just under a boundary moves up
 * to the next unit instead of printing `100.0k` or `1000k`.
 */
export function formatTokensShort(t: TFunction, count: number): string {
  if (count < 1_000) return String(Math.round(count));
  const tenths = Math.round(count / 100);
  if (tenths < 1_000) return `${formatNumber(t, tenths / 10, 1)}k`;
  const thousands = Math.round(count / 1_000);
  if (thousands < 1_000) return `${thousands}k`;
  return `${formatNumber(t, count / 1_000_000, 2)}M`;
}

/**
 * From one unit up, two decimals. Below, the first two digits that are not
 * zero, since two decimals would print nearly every reply as 0.00. Null for
 * an amount that is not above zero: a cost is never shown as nothing.
 */
export function formatCost(t: TFunction, cost: Money | undefined): string | null {
  if (!cost || !(cost.amount > 0)) return null;
  const { amount, currency } = cost;
  const decimals = amount >= 1 ? 2 : Math.max(2, Math.ceil(-Math.log10(amount)) + 1);
  // Rounding can leave a zero past the second decimal: 0.0996 is "0.100" at three.
  const fixed = amount.toFixed(decimals).replace(/(\.\d\d\d*?)0+$/, "$1");
  const text = formatNumber(t, Number(fixed), fixed.split(".")[1].length);
  return currency === "USD"
    ? t("format.usd", { amount: text })
    : t("format.currency", { amount: text, currency });
}

/** One decimal under a minute, where "Worked for" rounds to whole seconds. */
export function formatModelTime(t: TFunction, ms: number): string {
  return ms < 59_950
    ? t("format.seconds", { value: formatNumber(t, ms / 1_000, 1) })
    : formatDuration(t, ms);
}

export interface Figure {
  label: string;
  value: string;
}

/**
 * Tokens by kind. Input written to the provider's cache was new input on
 * this reply, so it counts as input. A kind with no tokens has no row.
 */
export function tokenFigures(t: TFunction, usage: TokenUsage | undefined): Figure[] {
  if (!usage) return [];
  const counts: [string, number][] = [
    [t("usage.figures.input"), (usage.input ?? 0) + (usage.cacheWrite ?? 0)],
    [t("usage.figures.cachedInput"), usage.cacheRead ?? 0],
    [t("usage.figures.output"), usage.output ?? 0],
    [t("usage.figures.reasoning"), usage.reasoning ?? 0],
  ];
  return counts
    .filter(([, count]) => count > 0)
    .map(([label, count]) => ({ label, value: formatTokens(t, count) }));
}

/** How full the context is, as a share of the window: 0 to 1. */
export function contextShare(tokens: number, window: number): number {
  return Math.min(1, Math.max(0, tokens / window));
}

export function formatShare(share: number): string {
  const percent = Math.round(share * 100);
  return percent === 0 && share > 0 ? "<1%" : `${percent}%`;
}
