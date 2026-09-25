import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Icon } from "@/src/ui/Icon";
import { Pulse } from "@/src/ui/Pulse";

export interface ReasoningDrawerProps {
  text?: string;
  enabled: boolean;
  streaming?: boolean;
}

/**
 * Inline, collapsed-by-default reasoning disclosure that sits above the
 * answer. It is intentionally plain text: reasoning is supporting context,
 * not another markdown document.
 */
export function ReasoningDrawer({ text, enabled, streaming = false }: ReasoningDrawerProps) {
  const [expanded, setExpanded] = useState(false);
  const hasReasoning = enabled && Boolean(text?.trim());
  if (!hasReasoning) return null;

  const label = (
    <Text className="text-[15px] text-text-muted">
      {streaming ? "Thinking…" : "Thought process"}
    </Text>
  );

  return (
    <View className="mb-2 self-stretch" testID="reasoning-drawer">
      <Pressable
        accessibilityHint={expanded ? "Hides the model reasoning" : "Shows the model reasoning"}
        accessibilityLabel="Reasoning"
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        className="flex-row items-center gap-1 self-start py-1"
        hitSlop={8}
        onPress={() => setExpanded((current) => !current)}
        testID="reasoning-toggle"
      >
        {streaming ? <Pulse>{label}</Pulse> : label}
        <Icon name={expanded ? "chevron-down" : "chevron-right"} size={18} tone="textMuted" />
      </Pressable>
      {expanded ? (
        <Text
          selectable
          className="mb-1 mt-1 border-l-2 border-border pl-3 text-[14.5px] leading-[22px] text-text-muted"
          testID="reasoning-content"
        >
          {text}
        </Text>
      ) : null}
    </View>
  );
}
