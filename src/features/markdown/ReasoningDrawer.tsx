import { useState } from "react";
import { Pressable, Text, View } from "react-native";

export interface ReasoningDrawerProps {
  text?: string;
  enabled: boolean;
  streaming?: boolean;
}

/**
 * Inline, collapsed-by-default reasoning disclosure. It is intentionally plain
 * text: reasoning is supporting context, not another markdown document.
 */
export function ReasoningDrawer({ text, enabled, streaming = false }: ReasoningDrawerProps) {
  const [expanded, setExpanded] = useState(false);
  const hasReasoning = enabled && Boolean(text?.trim());
  if (!hasReasoning) return null;

  return (
    <View className="mt-2 self-start" testID="reasoning-drawer">
      <Pressable
        accessibilityHint={expanded ? "Hides the model reasoning" : "Shows the model reasoning"}
        accessibilityLabel="Reasoning"
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        className="flex-row items-center gap-2 rounded-lg px-2 py-1 active:bg-surface-hover"
        onPress={() => setExpanded((current) => !current)}
        testID="reasoning-toggle"
      >
        <Text className="text-xs font-semibold text-text-muted">
          {streaming ? "Reasoning…" : "Reasoning"}
        </Text>
        <Text className="text-xs text-text-muted">{expanded ? "Hide" : "Show"}</Text>
      </Pressable>
      {expanded ? (
        <Text
          selectable
          className="mt-1 max-h-64 border-l-2 border-border pl-2 text-xs leading-5 text-text-muted"
          testID="reasoning-content"
        >
          {text}
        </Text>
      ) : null}
    </View>
  );
}
