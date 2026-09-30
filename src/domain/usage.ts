import type { Money, TokenUsage } from "./types";

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
