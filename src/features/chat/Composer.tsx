/**
 * Message composer: attachments, the text input, and send — which becomes
 * stop while a reply is streaming. Stop renders only when the caller passes
 * `onStop` (gated by the provider's interrupt capability at the call site),
 * and the attach button only when the caller passes `onAttach` (gated by the
 * provider's attachments capability).
 */

import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type { Attachment } from "@/src/domain";
import { cn } from "@/src/lib/cn";
import { AttachmentChips } from "./AttachmentChips";

export interface ComposerProps {
  onSend: (text: string, attachments: Attachment[]) => void | Promise<void>;
  /** Present while a turn is live; replaces the send button. */
  onStop?: () => void;
  /** Present when the backend accepts attachments; shows the attach button. */
  onAttach?: () => void;
  /** Files staged for the next message. */
  attachments?: Attachment[];
  onRemoveAttachment?: (attachment: Attachment) => void;
}

export function Composer({
  onSend,
  onStop,
  onAttach,
  attachments = [],
  onRemoveAttachment,
}: ComposerProps) {
  const [text, setText] = useState("");
  const streaming = Boolean(onStop);

  async function handleSend() {
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || streaming) return;
    setText("");
    await onSend(trimmed, attachments);
  }

  const sendDisabled = text.trim().length === 0 && attachments.length === 0;

  return (
    <View className="border-t border-border bg-background">
      {attachments.length > 0 ? (
        <AttachmentChips
          attachments={attachments}
          onRemove={onRemoveAttachment}
          testID="composer-attachments"
        />
      ) : null}
      <View className="flex-row items-end gap-2 px-3 py-2">
        {onAttach && !streaming ? (
          <Pressable
            accessibilityHint="Attaches a photo or a file to your message"
            accessibilityLabel="Add attachment"
            accessibilityRole="button"
            className="rounded-xl border border-border bg-surface px-3 py-3 active:bg-surface-hover"
            onPress={onAttach}
            testID="composer-attach"
          >
            <Text className="text-xl leading-none text-text">+</Text>
          </Pressable>
        ) : null}
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
    </View>
  );
}
