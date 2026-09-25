/**
 * What a chat shows before its first message: a centred prompt, and
 * suggestion chips that start the draft for you. When no server is
 * configured the prompt becomes a way to connect one.
 */

import { Pressable, ScrollView, Text, View } from "react-native";
import { Button } from "@/src/ui/Button";
import { Icon, type IconName } from "@/src/ui/Icon";
import type { PaletteKey } from "@/src/ui/theme";

export interface Suggestion {
  label: string;
  icon: IconName;
  /** Accent for the icon; chips are otherwise monochrome. */
  tone: PaletteKey;
  /** Draft text the chip puts in the composer. */
  draft: string;
}

export const SUGGESTIONS: Suggestion[] = [
  { label: "Help me write", icon: "pencil-outline", tone: "tintViolet", draft: "Help me write " },
  {
    label: "Summarize text",
    icon: "text-box-outline",
    tone: "tintAmber",
    draft: "Summarize this text:\n",
  },
  {
    label: "Brainstorm",
    icon: "lightbulb-outline",
    tone: "tintGreen",
    draft: "Brainstorm ideas for ",
  },
  { label: "Code", icon: "code-tags", tone: "tintBlue", draft: "Help me with this code:\n" },
  { label: "Explain", icon: "school-outline", tone: "tintOrange", draft: "Explain " },
];

export function EmptyChat({
  connected,
  onOpenSettings,
}: {
  connected: boolean;
  onOpenSettings: () => void;
}) {
  return (
    <View className="flex-1 items-center justify-center px-8 pb-10" testID="empty-chat">
      {connected ? (
        <Text className="text-center text-[26px] font-medium text-text">What can I help with?</Text>
      ) : (
        <>
          <Text className="text-center text-[26px] font-medium text-text">Connect a server</Text>
          <Text className="mb-6 mt-2 text-center text-[15px] leading-[22px] text-text-muted">
            OpenChat talks to your own OpenCode server. Add its address to start chatting.
          </Text>
          <Button label="Open settings" onPress={onOpenSettings} testID="empty-open-settings" />
        </>
      )}
    </View>
  );
}

export function SuggestionChips({ onPick }: { onPick: (suggestion: Suggestion) => void }) {
  return (
    <ScrollView
      horizontal
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      contentContainerClassName="gap-2 px-4 pb-2.5"
      testID="suggestions"
    >
      {SUGGESTIONS.map((suggestion) => (
        <Pressable
          key={suggestion.label}
          accessibilityRole="button"
          accessibilityLabel={suggestion.label}
          className="h-10 flex-row items-center gap-2 rounded-full border border-border bg-background px-3.5 active:bg-surface"
          onPress={() => onPick(suggestion)}
          testID={`suggestion-${suggestion.label}`}
        >
          <Icon name={suggestion.icon} size={18} tone={suggestion.tone} />
          <Text className="text-[14.5px] text-text">{suggestion.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
