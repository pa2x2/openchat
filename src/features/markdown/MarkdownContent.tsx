import Markdown, {
  createMarkdownIt,
  sealIncompleteMarkdown,
} from "@ronradtke/react-native-markdown-display";
import * as Clipboard from "expo-clipboard";
import { useCallback, useMemo } from "react";
import { Linking, Text, View } from "react-native";
import type { ColorSchemeName } from "@/src/ui/theme";
import { projectMarkdown } from "./streamProjection";
import { getMarkdownStyles } from "./styles";

const markdownParser = createMarkdownIt();
const disabledImageHandlers: string[] = [];

export interface MarkdownContentProps {
  text: string;
  role: "user" | "assistant";
  streaming: boolean;
  colorScheme: ColorSchemeName;
  testID?: string;
}

function isSafeLink(url: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(url.trim());
}

/**
 * Renders one message body. During streaming, only structurally stable blocks
 * are parsed as markdown; the current block remains lossless plain text until
 * it reaches a safe boundary.
 */
export function MarkdownContent({
  text,
  role,
  streaming,
  colorScheme,
  testID,
}: MarkdownContentProps) {
  const projection = useMemo(() => projectMarkdown(text, streaming), [text, streaming]);
  const styles = useMemo(() => getMarkdownStyles(role, colorScheme), [role, colorScheme]);
  const textColor = role === "user" ? "#ffffff" : colorScheme === "dark" ? "#ededed" : "#18181b";
  const markdownSource = useMemo(
    () => (streaming ? projection.stable : sealIncompleteMarkdown(projection.stable)),
    [projection.stable, streaming],
  );

  const handleLinkPress = useCallback((url: string): boolean => {
    if (!isSafeLink(url)) return false;
    void Linking.openURL(url).catch(() => undefined);
    // The markdown package opens the URL itself when the callback returns true.
    return false;
  }, []);

  const handleCopyCode = useCallback((code: string): void => {
    try {
      void Clipboard.setStringAsync(code).catch(() => undefined);
    } catch {
      // Clipboard support can be unavailable on web or in a restricted host.
    }
  }, []);

  return (
    <View testID={testID}>
      {markdownSource ? (
        <Markdown
          allowedImageHandlers={disabledImageHandlers}
          colorScheme={colorScheme}
          defaultImageHandler={null}
          markdownit={markdownParser}
          onCopyCode={handleCopyCode}
          onLinkPress={handleLinkPress}
          style={styles}
        >
          {markdownSource}
        </Markdown>
      ) : null}
      {projection.tail ? (
        <Text selectable style={{ color: textColor, fontSize: 16, lineHeight: 23 }}>
          {projection.tail}
        </Text>
      ) : null}
      {streaming ? (
        <Text
          accessibilityLabel="Generating"
          style={{ color: textColor, fontSize: 16, lineHeight: 23 }}
        >
          {projection.tail ? "▋" : "…"}
        </Text>
      ) : null}
    </View>
  );
}
