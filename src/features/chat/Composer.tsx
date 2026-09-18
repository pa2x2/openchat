/**
 * Message composer: text input plus send, which becomes stop while a
 * reply is streaming. Stop renders only when the caller passes `onStop`
 * (gated by the provider's interrupt capability at the call site).
 */

import { useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { cn } from "@/src/lib/cn";

export interface ComposerProps {
  onSend: (text: string) => void | Promise<void>;
  /** Present while a turn is live; replaces the send button. */
  onStop?: () => void;
}

export function Composer({ onSend, onStop }: ComposerProps) {
  const [text, setText] = useState("");
  const streaming = Boolean(onStop);

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    setText("");
    await onSend(trimmed);
  }

  return (
    <View className="flex-row items-end gap-2 border-t border-border bg-background px-3 py-2">
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Message"
        placeholderTextColor="rgb(var(--oc-text-muted))"
        multiline
        accessibilityLabel="Message"
        className="max-h-32 flex-1 rounded-xl border border-border bg-surface px-4 py-3 text-base text-text focus:border-primary"
        testID="composer-input"
      />
      {streaming ? (
        <TouchableOpacity
          onPress={onStop}
          accessibilityLabel="Stop generating"
          className="rounded-xl bg-surface px-4 py-3 active:bg-surface-hover"
          testID="composer-stop"
        >
          <Text className="text-base font-semibold text-text">Stop</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={() => void handleSend()}
          disabled={text.trim().length === 0}
          accessibilityLabel="Send message"
          className={cn(
            "rounded-xl px-4 py-3",
            text.trim().length > 0 ? "bg-primary active:bg-primary/80" : "bg-surface",
          )}
          testID="composer-send"
        >
          <Text
            className={cn(
              "text-base font-semibold",
              text.trim().length > 0 ? "text-primary-foreground" : "text-text-muted",
            )}
          >
            Send
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
