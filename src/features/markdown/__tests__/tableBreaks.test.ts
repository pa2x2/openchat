import { separateTables } from "../tableBreaks";

describe("separateTables", () => {
  it("separates a table from the line above it, but never inside a code fence", () => {
    const table = "| a | b |\n|---|---|\n| 1 | 2 |";
    expect(separateTables(`**Estimate**\n${table}`)).toBe(`**Estimate**\n\n${table}`);

    const fenced = "```md\n**Estimate**\n" + table + "\n```";
    expect(separateTables(fenced)).toBe(fenced);
  });
});
