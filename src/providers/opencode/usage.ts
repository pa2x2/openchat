import { totalTokens, type Money, type TokenUsage } from "@/src/domain";

/** Structural subset of the client's token counts, as events and messages both carry them. */
export interface WireTokens {
  input: number;
  output: number;
  reasoning: number;
  cache?: { read: number; write: number };
}

/**
 * The server writes zeros where nothing was counted, such as a step that
 * never reached the model or a chat not used yet. Those are no usage at all.
 */
export function toTokenUsage(tokens: WireTokens | undefined): TokenUsage | undefined {
  if (!tokens) return undefined;
  const usage: TokenUsage = {
    input: tokens.input,
    output: tokens.output,
    reasoning: tokens.reasoning,
    cacheRead: tokens.cache?.read,
    cacheWrite: tokens.cache?.write,
  };
  return totalTokens(usage) > 0 ? usage : undefined;
}

/**
 * The server prices usage from its model catalog, in US dollars. It reports
 * zero both for a free model and for one it has no price for, so a zero says
 * nothing.
 */
export function toCost(cost: number | undefined): Money | undefined {
  return typeof cost === "number" && cost > 0 ? { amount: cost, currency: "USD" } : undefined;
}
