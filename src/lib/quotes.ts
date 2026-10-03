/**
 * How quotes travel inside a message's text. The model reads only the text,
 * and other clients show it as it is, so every quote is written into it as
 * markdown: a blockquote (a fenced block for code), then the quote's comment,
 * and what the user typed last.
 *
 * `Message.quotes` is the structured copy kept beside the text. The app shows
 * a message's quotes apart from its body only while the text still reads
 * exactly as `quotedText` wrote it; otherwise the text is shown whole.
 */

import type { Quote } from "@/src/domain";

function fenceFor(code: string): string {
  const longest = Math.max(0, ...(code.match(/`+/g) ?? []).map((run) => run.length));
  return "`".repeat(Math.max(3, longest + 1));
}

function quoteBlock(quote: Quote): string {
  if (quote.code !== undefined) {
    const fence = fenceFor(quote.text);
    return `${fence}${quote.code}\n${quote.text}\n${fence}`;
  }
  return quote.text
    .split("\n")
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
}

export function quotedText(quotes: readonly Quote[], body: string): string {
  const parts = quotes.flatMap((quote) =>
    quote.comment ? [quoteBlock(quote), quote.comment] : [quoteBlock(quote)],
  );
  if (body) parts.push(body);
  return parts.join("\n\n");
}

/** What was typed after the quotes, or null when `text` no longer starts with them. */
export function bodyAfterQuotes(text: string, quotes: readonly Quote[]): string | null {
  const head = quotedText(quotes, "");
  if (text === head) return "";
  return text.startsWith(`${head}\n\n`) ? text.slice(head.length + 2) : null;
}

/**
 * The words as they are worth quoting: without the blank space a selection
 * picks up at its ends. Code keeps the indentation of its first line.
 */
export function trimQuoted(text: string, code: boolean): string {
  return code ? text.replace(/^\s*\n/, "").trimEnd() : text.trim();
}
