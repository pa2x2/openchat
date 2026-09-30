import { mergeReports, transcriptUsage, type UsageEntry } from "../usage";
import type { UsageReport } from "../types";

const at = (day: number, hour = 12) => new Date(2026, 8, day, hour).getTime();
const usd = (amount: number) => ({ amount, currency: "USD" });

// A server stops counting a chat once it is deleted, so the app adds back what
// the chat had used. Done carelessly, that counts the chat's replies from
// before the period, gives a model the server also reports a second row, or
// leaves a day the two share as two entries.
it("adds a deleted chat to the server's report, for the part of it inside the period", () => {
  const model = { provider: "zen", id: "glm" };
  const deleted: UsageEntry[] = [
    { role: "user", createdAt: at(10) },
    {
      role: "assistant",
      createdAt: at(10),
      model,
      usage: { input: 900 },
      cost: usd(9),
      requests: 3,
    },
    { role: "user", createdAt: at(21) },
    {
      role: "assistant",
      createdAt: at(21),
      model,
      usage: { input: 100, output: 10 },
      cost: usd(0.5),
      requests: 2,
    },
    // Stopped before the model answered: nothing to count.
    { role: "assistant", createdAt: at(22) },
  ];
  const server: UsageReport = {
    requests: 4,
    usage: { input: 400, output: 40 },
    cost: usd(1),
    chats: 2,
    prompts: 3,
    models: [{ model, requests: 4, usage: { input: 400, output: 40 }, cost: usd(1) }],
    days: [
      { date: "2026-09-21", requests: 1, usage: { input: 50 } },
      { date: "2026-09-23", requests: 3, usage: { input: 350, output: 40 }, cost: usd(1) },
    ],
  };

  expect(mergeReports(server, transcriptUsage([deleted], { from: at(20, 0) }))).toEqual({
    requests: 6,
    usage: { input: 500, output: 50 },
    cost: usd(1.5),
    from: at(21),
    chats: 3,
    prompts: 4,
    models: [{ model, requests: 6, usage: { input: 500, output: 50 }, cost: usd(1.5) }],
    days: [
      { date: "2026-09-21", requests: 3, usage: { input: 150, output: 10 }, cost: usd(0.5) },
      { date: "2026-09-23", requests: 3, usage: { input: 350, output: 40 }, cost: usd(1) },
    ],
  });
});
