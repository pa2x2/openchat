import { parseMarkdownWithOptions, type MarkdownNode } from "react-native-nitro-markdown/headless";

export type { MarkdownNode };

/**
 * Parses a whole message. A streaming reply is parsed in full on every frame:
 * the native parser is fast enough, and an unfinished block already parses
 * as what it is becoming (an open fence is a code block to the end).
 *
 * Raw HTML stays literal text. If the parser fails (input over its size cap,
 * native module missing), the message shows as one plain paragraph rather
 * than disappearing.
 */
export function parseMarkdown(text: string): MarkdownNode {
  try {
    return parseMarkdownWithOptions(text, { gfm: true, math: false, html: false });
  } catch {
    return {
      type: "document",
      children: [{ type: "paragraph", beg: 0, children: [{ type: "text", content: text }] }],
    };
  }
}
