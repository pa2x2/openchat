const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const DELIMITER_ROW = /^ {0,3}\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/**
 * Inserts a blank line before a table that directly follows a line of text.
 * md4c only starts a table when the header row is the first line of its
 * paragraph, so "**Heading**\n| a | b |\n|---|---|" renders as pipe-filled
 * text, while GitHub (and the models imitating it) treat it as a table.
 *
 * Lines inside fenced code blocks are left alone. The blank line goes before
 * the table, so blocks above it keep their source offsets while streaming.
 */
export function separateTables(text: string): string {
  if (!text.includes("|")) return text;
  const lines = text.split("\n");
  const out: string[] = [];
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const marker = FENCE.exec(line)?.[1];
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null;
    } else if (marker) {
      fence = marker;
    } else if (
      i > 0 &&
      lines[i - 1].trim() !== "" &&
      line.includes("|") &&
      i + 1 < lines.length &&
      lines[i + 1].includes("|") &&
      DELIMITER_ROW.test(lines[i + 1])
    ) {
      out.push("");
    }
    out.push(line);
  }
  return out.join("\n");
}
