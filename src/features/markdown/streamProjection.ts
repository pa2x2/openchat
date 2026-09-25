/**
 * Projects an incrementally delivered markdown string into a stable prefix and
 * an uncommitted tail.
 *
 * The stream machine keeps the canonical raw text in the message store. This
 * helper is deliberately a view concern: it never changes or discards source
 * text, it only decides which part is safe to hand to a markdown parser while
 * the message is still live.
 */

export interface MarkdownProjection {
  /** A prefix ending at a block boundary that is safe to parse as markdown. */
  stable: string;
  /** The current, possibly incomplete block. */
  tail: string;
}

interface OpenFence {
  character: "`" | "~";
  length: number;
}

function openingFence(line: string): OpenFence | null {
  // CommonMark permits up to three leading spaces before a fence.
  const match = /^ {0,3}(`{3,}|~{3,})/.exec(line);
  if (!match?.[1]) return null;

  return {
    character: match[1][0] as "`" | "~",
    length: match[1].length,
  };
}

function closesFence(line: string, fence: OpenFence): boolean {
  const character = fence.character === "`" ? "`" : "~";
  const expression = new RegExp(`^ {0,3}${character}{${fence.length},}[ \\t\\r]*$`);
  return expression.test(line);
}

/**
 * Finds the last conservative block boundary in a streaming string.
 *
 * A blank line is a boundary only outside a fenced code block. A closing fence
 * is also a boundary, which lets a completed code block become rich before the
 * next paragraph arrives. Tables are intentionally held until their following
 * blank line; this is more conservative than the parser and prevents a partial
 * table from being laid out as a finished one.
 */
function safePrefixLength(text: string): number {
  const lines = text.split("\n");
  let lineStart = 0;
  let safeEnd = 0;
  let openFence: OpenFence | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const hasNewline = index < lines.length - 1;
    const lineEnd = lineStart + line.length + (hasNewline ? 1 : 0);

    if (openFence) {
      if (closesFence(line, openFence)) {
        openFence = null;
        safeEnd = lineEnd;
      }
    } else {
      const fence = openingFence(line);
      if (fence) {
        openFence = fence;
      } else if (line.trim().length === 0) {
        safeEnd = lineEnd;
      }
    }

    lineStart = lineEnd;
  }

  return safeEnd;
}

/**
 * Returns a lossless projection of `text` for a live or terminal message.
 * Terminal messages always flush the complete raw string to the renderer.
 */
export function projectMarkdown(text: string, streaming: boolean): MarkdownProjection {
  if (!streaming) return { stable: text, tail: "" };

  const stableLength = safePrefixLength(text);
  return {
    stable: text.slice(0, stableLength),
    tail: text.slice(stableLength),
  };
}
