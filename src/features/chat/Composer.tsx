/**
 * Message composer: text input plus send, which becomes stop while a
 * reply is streaming. Stop renders only when the caller passes `onStop`
 * (gated by the provider's interrupt capability at the call site).
 */

import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
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

  const sendDisabled = text.trim().length === 0;

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
        <Pressable
          accessibilityHint="Stops the current response"
          accessibilityLabel="Stop generating"
          accessibilityRole="button"
          accessibilityState={{ busy: true }}
          className="flex-row items-center gap-2 rounded-xl bg-danger px-4 py-3 active:bg-danger/80"
          onPress={onStop}
          testID="composer-stop"
        >
          <View className="h-3 w-3 rounded-[2px] bg-primary-foreground" />
          <Text className="text-base font-semibold text-primary-foreground">Stop</Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityHint="Sends the message"
          accessibilityLabel="Send message"
          accessibilityRole="button"
          accessibilityState={{ disabled: sendDisabled }}
          className={cn(
            "rounded-xl px-4 py-3",
            !sendDisabled && "bg-primary active:bg-primary/80",
            sendDisabled && "bg-surface",
          )}
          disabled={sendDisabled}
          onPress={() => void handleSend()}
          testID="composer-send"
        >
          <Text
            className={cn(
              "text-base font-semibold",
              sendDisabled ? "text-text-muted" : "text-primary-foreground",
            )}
          >
            Send
          </Text>
        </Pressable>
      )}
    </View>
  );
}
