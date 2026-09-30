/**
 * The usage report, from the server's session statistics.
 *
 * The server adds up the steps of the sessions it has right now, by the time
 * each step started. A session that was deleted is gone from the sums, and so
 * is the naming of a chat, which is not a step.
 */

import { localDay, type UsageQuery, type UsageReport, type UsageTotals } from "@/src/domain";
import { timeoutSignal, type OpenCodeClient } from "./client";
import { fromWireModel } from "./sessions";
import { toCost, toTokenUsage, type WireTokens } from "./usage";

const REPORT_TIMEOUT_MS = 20_000;

function toTotals(wire: { steps: number; tokens: WireTokens; cost: number }): UsageTotals {
  return { requests: wire.steps, usage: toTokenUsage(wire.tokens), cost: toCost(wire.cost) };
}

/** The device's IANA time zone; undefined on a runtime built without the data to name it. */
function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** Where a calendar day written "2026-09-30" starts and ends on the device. */
function dayBounds(date: string): { from: number; to: number } {
  const [year, month, day] = date.split("-").map(Number);
  return {
    from: new Date(year, month - 1, day).getTime(),
    to: new Date(year, month - 1, day + 1).getTime(),
  };
}

function everyDay(from: number, to: number): string[] {
  const days: string[] = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  while (cursor.getTime() < to) {
    days.push(localDay(cursor.getTime()));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export async function usageReport(client: OpenCodeClient, query: UsageQuery): Promise<UsageReport> {
  const timeout = timeoutSignal(REPORT_TIMEOUT_MS);
  try {
    const timezone = deviceTimeZone();
    const stats = await client.session.stats(
      { from: query.from, to: query.to, timezone, tools: "none" },
      { signal: timeout.signal },
    );
    // The server gives a day only its step count. What a day used takes a
    // request for that day alone, so only days with steps are asked for. The
    // server cuts days in the zone it is given; without one to give, its days
    // are not the device's, and every day of the span is asked for instead.
    let dates: string[] = [];
    if (query.daily && query.from !== undefined) {
      dates = timezone
        ? stats.activity.map((day) => day.date)
        : everyDay(query.from, query.to ?? Date.now());
    }
    const days = await Promise.all(
      dates.map(async (date) => {
        const bounds = dayBounds(date);
        const day = await client.session.stats(
          {
            from: Math.max(bounds.from, query.from ?? bounds.from),
            to: Math.min(bounds.to, query.to ?? bounds.to),
            tools: "none",
          },
          { signal: timeout.signal },
        );
        return { ...toTotals(day), date };
      }),
    );
    return {
      ...toTotals(stats),
      // Asked for a span, the server echoes it; left to pick, it starts at the first step.
      from: query.from === undefined && stats.steps > 0 ? stats.range.from : undefined,
      chats: stats.sessions,
      prompts: stats.prompts,
      models: stats.models.map((row) => ({ ...toTotals(row), model: fromWireModel(row.model) })),
      days: days
        .filter((day) => (day.requests ?? 0) > 0)
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  } finally {
    timeout.done();
  }
}
