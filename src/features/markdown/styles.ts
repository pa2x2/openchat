import type { MarkdownStyleMap } from "@ronradtke/react-native-markdown-display";
import type { ResolvedPalette } from "@/src/ui/theme";

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
): MarkdownStyleMap {
  const isUser = role === "user";
  const foreground = isUser ? palette.primaryForeground : palette.text;
  const muted = isUser ? "#d1fae5" : palette.textMuted;
  const quoteBackground = isUser ? "rgba(255,255,255,0.14)" : palette.surface;
  const quoteBorder = isUser ? "rgba(255,255,255,0.55)" : palette.primary;
  const inlineCodeBackground = isUser ? "rgba(0,0,0,0.18)" : palette.surfaceHover;
  const codeBorder = isUser ? "rgba(255,255,255,0.25)" : palette.border;
  const tableHeader = isUser ? "rgba(0,0,0,0.16)" : palette.surfaceHover;
  const tableRow = isUser ? "rgba(255,255,255,0.08)" : palette.background;
  const linkColor = isUser ? "#d1fae5" : palette.primary;

  return {
    body: {
      color: foreground,
      width: "100%",
    },
    text: {
      color: foreground,
      fontSize: 16,
      lineHeight: 23,
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
      fontSize: 28,
      lineHeight: 34,
      marginTop: 12,
      marginBottom: 8,
    },
    heading2: {
      color: foreground,
      fontSize: 24,
      lineHeight: 30,
      marginTop: 12,
      marginBottom: 8,
    },
    heading3: {
      color: foreground,
      fontSize: 20,
      lineHeight: 26,
      marginTop: 10,
      marginBottom: 6,
    },
    heading4: {
      color: foreground,
      fontSize: 18,
      lineHeight: 24,
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
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 6,
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
      color: isUser ? palette.primaryForeground : palette.danger,
      backgroundColor: inlineCodeBackground,
      borderColor: codeBorder,
      borderWidth: 1,
      borderRadius: 4,
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
      borderRadius: 8,
      overflow: "hidden",
    },
    fence_header: {
      backgroundColor: isUser ? "rgba(0,0,0,0.28)" : palette.surface,
      borderBottomColor: palette.border,
    },
    fence_language_label: {
      color: palette.codeMuted,
      fontFamily: "monospace",
      fontSize: 11,
    },
    fence_copy_button: {
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    fence_copy_text: {
      color: palette.codeMuted,
      fontSize: 11,
    },
    fence_code: {
      backgroundColor: palette.code,
      padding: 12,
    },
    fence_token: {
      color: palette.codeText,
      fontFamily: "monospace",
      fontSize: 13,
      lineHeight: 19,
    },
    table: {
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 6,
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
