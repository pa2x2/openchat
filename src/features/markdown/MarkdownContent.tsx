import { use, useMemo } from "react";
import { View } from "react-native";
import { useAppTheme } from "@/src/ui/theme";
import { MarkdownBlocks } from "./MarkdownBlocks";
import { parseMarkdown } from "./parse";
import { QuoteScope, QuoteTarget } from "./quoting";
import { getMarkdownTheme, type MarkdownBackdrop } from "./styles";

export interface MarkdownContentProps {
  text: string;
  role: "user" | "assistant";
  streaming: boolean;
  /** Defaults to the page; pass `"raised"` when rendering inside a sheet card. */
  backdrop?: MarkdownBackdrop;
  testID?: string;
}

/**
 * Renders one message body. A streaming reply renders exactly as a finished
 * one would at that point: there is no plain-text tail waiting for a block to
 * close, so nothing reflows when the reply ends.
 */
export function MarkdownContent({
  text,
  role,
  streaming,
  backdrop = "page",
  testID,
}: MarkdownContentProps) {
  const { scheme, colors } = useAppTheme();
  const theme = useMemo(
    () => getMarkdownTheme(role, colors, scheme, backdrop),
    [role, colors, scheme, backdrop],
  );
  const document = useMemo(() => parseMarkdown(text), [text]);
  const quotable = use(QuoteScope) !== null;

  const blocks = <MarkdownBlocks nodes={document.children ?? []} theme={theme} live={streaming} />;
  return <View testID={testID}>{quotable ? <QuoteTarget>{blocks}</QuoteTarget> : blocks}</View>;
}
