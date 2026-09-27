import type { ChatSummary } from "@/src/domain";
import { groupChatsByDate } from "../dateGroups";

const chat = (id: string, updatedAt: Date): ChatSummary => ({
  id,
  title: id,
  updatedAt: updatedAt.getTime(),
});

describe("groupChatsByDate", () => {
  it("buckets by calendar day and names months from other years", () => {
    // Just past midnight on 2 January, local time.
    const now = new Date(2026, 0, 2, 0, 30);
    const groups = groupChatsByDate(
      [
        chat("minutes-ago", new Date(2026, 0, 2, 0, 5)),
        // Under an hour ago, but on the previous calendar day.
        chat("before-midnight", new Date(2026, 0, 1, 23, 50)),
        chat("last-month", new Date(2025, 11, 1, 12, 0)),
      ],
      now,
    );
    expect(groups.map((group) => [group.title, group.data.map((each) => each.id)])).toEqual([
      ["Today", ["minutes-ago"]],
      ["Yesterday", ["before-midnight"]],
      ["December 2025", ["last-month"]],
    ]);
  });
});
