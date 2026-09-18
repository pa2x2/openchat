import { formatTimestamp } from "@/src/lib/time";

const NOW = new Date("2026-09-18T15:04:00");

describe("formatTimestamp", () => {
  it("shows the time for today", () => {
    expect(formatTimestamp(new Date("2026-09-18T09:05:00").getTime(), NOW)).toBe("09:05");
  });

  it("shows a short date for older chats this year", () => {
    expect(formatTimestamp(new Date("2026-02-03T09:05:00").getTime(), NOW)).toBe("Feb 3");
  });

  it("includes the year for older chats", () => {
    expect(formatTimestamp(new Date("2024-12-31T23:59:00").getTime(), NOW)).toBe("Dec 31, 2024");
  });
});
