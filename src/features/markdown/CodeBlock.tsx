import * as Clipboard from "expo-clipboard";
import { memo, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
// RNGH's ScrollView claims a sideways swipe before the drawer's pan can, so
// the code scrolls instead of the sidebar opening.
import { ScrollView } from "react-native-gesture-handler";
import { Icon } from "@/src/ui/Icon";
import { useCodeLines, type CodeLine } from "./highlight";
import { MONOSPACE, type MarkdownTheme } from "./styles";

const COPIED_MS = 1500;

export interface CodeBlockProps {
  code: string;
  language?: string;
  theme: MarkdownTheme;
  /** Still streaming: the last line may be incomplete. */
  live: boolean;
}

const Line = memo(function Line({ tokens }: { tokens: CodeLine }) {
  return tokens.map((token, index) =>
    token.color || token.italic ? (
      <Text
        key={index}
        style={{ color: token.color, fontStyle: token.italic ? "italic" : undefined }}
      >
        {token.content}
      </Text>
    ) : (
      token.content
    ),
  );
});

export function CodeBlock({ code, language, theme, live }: CodeBlockProps) {
  const lines = useCodeLines(code, language, theme.scheme, live);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function handleCopy() {
    // Unavailable on web or in a restricted host; nothing to tell the user.
    void Clipboard.setStringAsync(code).catch(() => undefined);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }

  return (
    <View
      style={{
        backgroundColor: theme.code,
        borderColor: theme.border,
        borderWidth: 1,
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: 14,
          paddingRight: 4,
          paddingTop: 4,
        }}
      >
        <Text style={{ color: theme.codeMuted, fontSize: 13 }}>{language ?? ""}</Text>
        <Pressable
          accessibilityLabel={copied ? "Copied" : "Copy code"}
          accessibilityRole="button"
          hitSlop={6}
          onPress={handleCopy}
          style={{ padding: 8 }}
        >
          <Icon name={copied ? "check" : "content-copy"} size={15} color={theme.codeMuted} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text
          selectable
          style={{
            color: theme.codeText,
            fontFamily: MONOSPACE,
            fontSize: 13.5,
            lineHeight: 20,
            paddingHorizontal: 14,
            paddingTop: 2,
            paddingBottom: 14,
          }}
        >
          {lines.map((tokens, index) => (
            <Text key={index}>
              {index > 0 ? "\n" : null}
              <Line tokens={tokens} />
            </Text>
          ))}
        </Text>
      </ScrollView>
    </View>
  );
}
