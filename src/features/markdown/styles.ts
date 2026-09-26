import type { MarkdownStyleMap } from "@ronradtke/react-native-markdown-display";
import type { ResolvedPalette } from "@/src/ui/theme";

/** What the markdown is drawn on: the page itself, or a `raised` card in a sheet. */
export type MarkdownBackdrop = "page" | "raised";

/**
 * Markdown renders with real React Native styles rather than NativeWind
 * classes, so it reads the resolved palette instead of the CSS variables.
 * Every colour below traces back to `src/ui/palette.ts` — there is no
 * hand-maintained copy of the palette here.
 *
 * Keep the map stable and role-aware so a streaming update only reparses the
 * message that actually changed.
 */
export function getMarkdownStyles(
  role: "user" | "assistant",
  palette: ResolvedPalette,
  backdrop: MarkdownBackdrop = "page",
): MarkdownStyleMap {
  const isUser = role === "user";
  // Quotes, inline code and table headers are panels one step off whatever
  // the text sits on. On a `raised` card `surface` would blend in, so they
  // step the other way, to `elevated`.
  const panel = backdrop === "raised" ? palette.elevated : palette.surface;
  // The user's side sits on the tinted bubble, so it takes the bubble's own
  // text colour; everything else is the page palette.
  const foreground = isUser ? palette.userBubbleText : palette.text;
  const muted = isUser ? palette.userBubbleText : palette.textMuted;
  const quoteBackground = isUser ? "transparent" : panel;
  const quoteBorder = isUser ? palette.userBubbleText : palette.border;
  const inlineCodeBackground = isUser ? palette.background : panel;
  const tableHeader = panel;
  const tableRow = palette.background;
  const linkColor = isUser ? palette.userBubbleText : palette.primary;

  return {
    body: {
      color: foreground,
      width: "100%",
    },
    text: {
      color: foreground,
      fontSize: 16,
      lineHeight: 24,
    },
    textgroup: {
      color: foreground,
    },
    paragraph: {
      color: foreground,
      marginTop: 8,
      marginBottom: 8,
    },
    heading1: {
      color: foreground,
      fontSize: 24,
      lineHeight: 31,
      fontWeight: "600",
      marginTop: 12,
      marginBottom: 8,
    },
    heading2: {
      color: foreground,
      fontSize: 21,
      lineHeight: 28,
      fontWeight: "600",
      marginTop: 12,
      marginBottom: 8,
    },
    heading3: {
      color: foreground,
      fontSize: 19,
      lineHeight: 26,
      fontWeight: "600",
      marginTop: 14,
      marginBottom: 6,
    },
    heading4: {
      color: foreground,
      fontSize: 17,
      lineHeight: 24,
      fontWeight: "600",
      marginTop: 10,
      marginBottom: 6,
    },
    heading5: {
      color: foreground,
      fontSize: 16,
      lineHeight: 22,
      marginTop: 8,
      marginBottom: 4,
    },
    heading6: {
      color: foreground,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 8,
      marginBottom: 4,
    },
    strong: {
      color: foreground,
      fontWeight: "700",
    },
    em: {
      color: foreground,
      fontStyle: "italic",
    },
    s: {
      color: muted,
      textDecorationLine: "line-through",
    },
    ins: {
      color: foreground,
      textDecorationLine: "underline",
    },
    blockquote: {
      color: foreground,
      backgroundColor: quoteBackground,
      borderColor: quoteBorder,
      borderLeftWidth: 3,
      marginLeft: 2,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 4,
    },
    bullet_list: {
      marginTop: 4,
      marginBottom: 4,
    },
    ordered_list: {
      marginTop: 4,
      marginBottom: 4,
    },
    list_item: {
      color: foreground,
      marginTop: 2,
      marginBottom: 2,
    },
    bullet_list_icon: {
      color: muted,
    },
    ordered_list_icon: {
      color: muted,
    },
    code_inline: {
      color: foreground,
      backgroundColor: inlineCodeBackground,
      fontFamily: "monospace",
      fontSize: 14,
      borderRadius: 5,
      paddingHorizontal: 4,
      paddingVertical: 1,
    },
    code_block: {
      color: palette.codeText,
      backgroundColor: palette.code,
      borderColor: palette.border,
    },
    fence: {
      backgroundColor: palette.code,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 16,
      marginTop: 6,
      marginBottom: 10,
      overflow: "hidden",
    },
    fence_header: {
      backgroundColor: palette.code,
      borderBottomWidth: 0,
      paddingHorizontal: 6,
      paddingTop: 4,
    },
    fence_language_label: {
      color: palette.codeMuted,
      fontSize: 13,
    },
    fence_copy_button: {
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    fence_copy_text: {
      color: palette.codeMuted,
      fontSize: 13,
    },
    fence_code: {
      backgroundColor: palette.code,
      paddingHorizontal: 14,
      paddingTop: 6,
      paddingBottom: 14,
    },
    fence_token: {
      color: palette.codeText,
      fontFamily: "monospace",
      fontSize: 13.5,
      lineHeight: 20,
    },
    table: {
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 12,
      marginTop: 8,
      marginBottom: 8,
    },
    thead: {
      backgroundColor: tableHeader,
    },
    tbody: {
      backgroundColor: tableRow,
    },
    th: {
      color: foreground,
      fontWeight: "700",
      padding: 8,
    },
    tr: {
      borderBottomColor: palette.border,
      borderBottomWidth: 1,
    },
    td: {
      color: foreground,
      padding: 8,
    },
    link: {
      color: linkColor,
      textDecorationLine: "underline",
    },
    blocklink: {
      color: linkColor,
    },
    image: {
      borderColor: palette.border,
    },
    hr: {
      backgroundColor: palette.border,
      marginTop: 12,
      marginBottom: 12,
    },
    hardbreak: {
      color: foreground,
    },
    softbreak: {
      color: foreground,
    },
    pre: {
      color: palette.codeText,
    },
    inline: {
      color: foreground,
    },
    span: {
      color: foreground,
    },
  };
}
