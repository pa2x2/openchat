import type { TextStyle } from "react-native";
import type { ColorSchemeName, ResolvedPalette } from "@/src/ui/theme";

/** What the markdown is drawn on: the page itself, or a `raised` card in a sheet. */
export type MarkdownBackdrop = "page" | "raised";

export interface MarkdownTheme {
  scheme: ColorSchemeName;
  /** Body text; every text style below builds on it. */
  body: TextStyle;
  headings: readonly TextStyle[];
  muted: string;
  link: string;
  /** Quotes, inline code and table headers. */
  panel: string;
  inlineCodeBackground: string;
  border: string;
  code: string;
  codeText: string;
  codeMuted: string;
}

export const MONOSPACE = "monospace";

/**
 * Markdown renders with plain React Native styles rather than NativeWind
 * classes, so it reads the resolved palette instead of the CSS variables.
 * Every colour below traces back to `src/ui/palette.ts`.
 */
export function getMarkdownTheme(
  role: "user" | "assistant",
  palette: ResolvedPalette,
  scheme: ColorSchemeName,
  backdrop: MarkdownBackdrop = "page",
): MarkdownTheme {
  const isUser = role === "user";
  // Panels are one step off whatever the text sits on. On a `raised` card
  // `surface` would blend in, so they step the other way, to `elevated`.
  const panel = backdrop === "raised" ? palette.elevated : palette.surface;
  // The user's side sits on the tinted bubble, so it takes the bubble's own
  // text colour; everything else is the page palette.
  const foreground = isUser ? palette.userBubbleText : palette.text;
  const heading = (fontSize: number, lineHeight: number): TextStyle => ({
    fontSize,
    lineHeight,
    fontWeight: "600",
  });

  return {
    scheme,
    body: { color: foreground, fontSize: 16, lineHeight: 24 },
    headings: [
      heading(24, 31),
      heading(21, 28),
      heading(19, 26),
      heading(17, 24),
      heading(16, 24),
      heading(15, 22),
    ],
    muted: isUser ? palette.userBubbleText : palette.textMuted,
    link: isUser ? palette.userBubbleText : palette.primary,
    panel: isUser ? "transparent" : panel,
    inlineCodeBackground: isUser ? palette.background : panel,
    border: isUser ? palette.userBubbleText : palette.border,
    code: palette.code,
    codeText: palette.codeText,
    codeMuted: palette.codeMuted,
  };
}
