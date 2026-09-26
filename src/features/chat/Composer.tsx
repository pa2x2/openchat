/**
 * Message composer: a floating pill with attach, the text input, and a round
 * send button — which becomes stop while a reply is streaming. Stop renders
 * only when the caller passes `onStop` (gated by the provider's interrupt
 * capability at the call site), and the attach button only when the caller
 * passes `onAttach` (gated by the provider's attachments capability). The
 * reasoning chip next to it shows when the caller passes `reasoning`, which
 * it does for models that offer variants.
 */

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type { Attachment } from "@/src/domain";
import { cn } from "@/src/lib/cn";
import { Icon } from "@/src/ui/Icon";
import { useAppTheme } from "@/src/ui/theme";
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
  /** Present when the model offers variants: the current level and a way to change it. */
  reasoning?: { label: string; onPress: () => void };
  /** Focuses the field on mount. */
  autoFocus?: boolean;
}

export interface ComposerHandle {
  /** Replaces the draft with `text` and focuses the field. */
  insert: (text: string) => void;
}

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { onSend, onStop, onAttach, attachments = [], onRemoveAttachment, reasoning, autoFocus },
  ref,
) {
  const [text, setText] = useState("");
  const input = useRef<TextInput>(null);
  const streaming = Boolean(onStop);
  const { colors, floatingShadow } = useAppTheme();

  useImperativeHandle(ref, () => ({
    insert: (next) => {
      setText(next);
      input.current?.focus();
    },
  }));

  async function handleSend() {
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || streaming) return;
    setText("");
    await onSend(trimmed, attachments);
  }

  const sendDisabled = text.trim().length === 0 && attachments.length === 0;
  // Like attach, the chip steps aside while a reply streams.
  const showAttach = Boolean(onAttach) && !streaming;
  const showReasoning = Boolean(reasoning) && !streaming;

  return (
    <View className="rounded-[28px] bg-elevated p-1.5" style={{ boxShadow: floatingShadow }}>
      {attachments.length > 0 ? (
        <AttachmentChips
          attachments={attachments}
          onRemove={onRemoveAttachment}
          testID="composer-attachments"
        />
      ) : null}
      <View className="flex-row items-end">
        {showAttach ? (
          <Pressable
            accessibilityHint="Attaches a photo or a file to your message"
            accessibilityLabel="Add attachment"
            accessibilityRole="button"
            className="h-11 w-11 items-center justify-center rounded-full active:bg-raised"
            onPress={onAttach}
            testID="composer-attach"
          >
            <Icon name="plus" size={26} />
          </Pressable>
        ) : null}
        {showReasoning && reasoning ? (
          <View className={cn("h-11 justify-center", !showAttach && "pl-1.5")}>
            <Pressable
              accessibilityHint="Chooses how much the model thinks before answering"
              accessibilityLabel={`Reasoning: ${reasoning.label}`}
              accessibilityRole="button"
              className="h-8 flex-row items-center gap-1 rounded-full bg-raised pl-2 pr-1.5 active:bg-raised-hover"
              onPress={reasoning.onPress}
              testID="composer-reasoning"
            >
              <Icon name="lightbulb-outline" size={17} tone="textMuted" />
              <Text className="text-[14px] font-medium text-text" numberOfLines={1}>
                {reasoning.label}
              </Text>
              <Icon name="chevron-down" size={16} tone="textMuted" />
            </Pressable>
          </View>
        ) : null}
        <TextInput
          ref={input}
          autoFocus={autoFocus}
          value={text}
          onChangeText={setText}
          placeholder="Ask anything"
          placeholderTextColor={colors.textFaint}
          multiline
          accessibilityLabel="Message"
          className={cn(
            "max-h-36 min-h-11 flex-1 py-2.5 text-base leading-[22px] text-text",
            showReasoning ? "px-2" : showAttach ? "px-1" : "px-3",
          )}
          testID="composer-input"
        />
        {streaming ? (
          <Pressable
            accessibilityHint="Stops the current response"
            accessibilityLabel="Stop generating"
            accessibilityRole="button"
            accessibilityState={{ busy: true }}
            className="m-0.5 h-10 w-10 items-center justify-center rounded-full bg-primary active:opacity-80"
            onPress={onStop}
            testID="composer-stop"
          >
            <View className="h-3 w-3 rounded-[2px] bg-primary-foreground" />
          </Pressable>
        ) : (
          <Pressable
            accessibilityHint="Sends the message"
            accessibilityLabel="Send message"
            accessibilityRole="button"
            accessibilityState={{ disabled: sendDisabled }}
            className={cn(
              "m-0.5 h-10 w-10 items-center justify-center rounded-full",
              sendDisabled ? "bg-raised-hover" : "bg-primary active:opacity-80",
            )}
            disabled={sendDisabled}
            onPress={() => void handleSend()}
            testID="composer-send"
          >
            <Icon
              name="arrow-up"
              size={22}
              tone={sendDisabled ? "textFaint" : "primaryForeground"}
            />
          </Pressable>
        )}
      </View>
    </View>
  );
});
