import { normalizeTokens, Prism, themes, type PrismTheme } from "prism-react-renderer";
import { useMemo } from "react";
import type { ColorSchemeName } from "@/src/ui/theme";

export interface CodeToken {
  content: string;
  /** Unset for plain text, which takes the block's text colour. */
  color?: string;
  italic?: boolean;
}

export type CodeLine = CodeToken[];

type TokenStyle = { color?: string; fontStyle?: string };

const dictionaries = new Map<string, Map<string, TokenStyle>>();

/** Token type → style for one theme and language, as prism-react-renderer resolves it. */
function dictionary(theme: PrismTheme, key: string, language: string): Map<string, TokenStyle> {
  const cached = dictionaries.get(key);
  if (cached) return cached;
  const styles = new Map<string, TokenStyle>();
  for (const entry of theme.styles) {
    if (entry.languages && !entry.languages.includes(language)) continue;
    for (const type of entry.types) {
      styles.set(type, { ...styles.get(type), ...entry.style });
    }
  }
  dictionaries.set(key, styles);
  return styles;
}

function plainLines(code: string): CodeLine[] {
  return code.split("\n").map((line) => [{ content: line }]);
}

export function highlightLines(
  code: string,
  language: string | undefined,
  scheme: ColorSchemeName,
): CodeLine[] {
  const name = language?.toLowerCase() ?? "";
  const grammar = name ? Prism.languages[name] : undefined;
  if (!grammar) return plainLines(code);

  const theme = scheme === "dark" ? themes.oneDark : themes.oneLight;
  const styles = dictionary(theme, `${scheme}:${name}`, name);
  return normalizeTokens(Prism.tokenize(code, grammar)).map((line) =>
    line
      .filter((token) => !token.empty)
      .map((token) => {
        let style: TokenStyle = {};
        for (const type of token.types) {
          if (type !== "plain") style = { ...style, ...styles.get(type) };
        }
        return {
          content: token.content,
          ...(style.color ? { color: style.color } : {}),
          ...(style.fontStyle === "italic" ? { italic: true } : {}),
        };
      }),
  );
}

/**
 * Highlighted lines of a code block. While `live` (the block is still
 * streaming), only completed lines are tokenized, and only when another line
 * completes; the line being written shows plain until then. Prism can't
 * resume mid-document, so re-running it per token would redo the whole block
 * every frame.
 */
export function useCodeLines(
  code: string,
  language: string | undefined,
  scheme: ColorSchemeName,
  live: boolean,
): CodeLine[] {
  const cut = live ? code.lastIndexOf("\n") : code.length;
  const settled = cut < 0 ? "" : code.slice(0, cut);
  const pending = live ? code.slice(cut + 1) : null;
  const lines = useMemo(
    () => (settled || !live ? highlightLines(settled, language, scheme) : []),
    [settled, live, language, scheme],
  );
  return useMemo(
    () => (pending === null ? lines : [...lines, [{ content: pending }]]),
    [lines, pending],
  );
}
