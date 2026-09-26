/**
 * Message composer: a floating card with the text input on top and a toolbar
 * below. Each optional control (stop, attach, reasoning chip) renders only
 * when the caller passes its prop, so capability gating stays at the call
 * site.
 */

import { useImperativeHandle, useRef, useState, type Ref } from "react";
import { Keyboard, Text, TextInput, View } from "react-native";
import { Pressable } from "@/src/ui/Pressable";
import type { Attachment } from "@/src/domain";
import { cn } from "@/src/lib/cn";
import { Icon } from "@/src/ui/Icon";
import { useAppTheme } from "@/src/ui/theme";
import { AttachmentChips } from "./AttachmentChips";

export interface ComposerProps {
  ref?: Ref<ComposerHandle>;
  /**
   * The field clears as soon as the user sends. Resolve to `false` when the
   * message did not go out, and the text comes back.
   */
  onSend: (text: string, attachments: Attachment[]) => void | boolean | Promise<void | boolean>;
  /** Present while a turn is live; replaces the send button. */
  onStop?: () => void;
  /** Present when the backend accepts attachments; shows the attach button. */
  onAttach?: () => void;
  /** Files staged for the next message. */
  attachments?: Attachment[];
  onRemoveAttachment?: (attachment: Attachment) => void;
  /** Present when the model offers variants: the current level and a way to change it. */
  reasoning?: { label: string; onPress: () => void };
  autoFocus?: boolean;
  placeholder?: string;
}

const NO_ATTACHMENTS: Attachment[] = [];

export interface ComposerHandle {
  /** Replaces the draft with `text` and focuses the field. */
  insert: (text: string) => void;
}

export function Composer({
  ref,
  onSend,
  onStop,
  onAttach,
  attachments = NO_ATTACHMENTS,
  onRemoveAttachment,
  reasoning,
  autoFocus,
  placeholder = "Ask anything",
}: ComposerProps) {
  const [text, setText] = useState("");
  const input = useRef<TextInput>(null);
  const streaming = Boolean(onStop);
  const { colors, floatingShadow } = useAppTheme();

  useImperativeHandle(
    ref,
    () => ({
      insert: (next) => {
        setText(next);
        input.current?.focus();
      },
    }),
    [],
  );

  async function handleSend() {
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || streaming) return;
    setText("");
    Keyboard.dismiss();
    const sent = await onSend(trimmed, attachments);
    if (sent === false) setText((current) => current || text);
  }

  const sendDisabled = text.trim().length === 0 && attachments.length === 0;
  // Attach and the chip step aside while a reply streams.
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
      <TextInput
        ref={input}
        autoFocus={autoFocus}
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        multiline
        accessibilityLabel="Message"
        className="max-h-36 min-h-11 px-3 py-2.5 text-base leading-[22px] text-text"
        testID="composer-input"
      />
      <View className="mx-2 mb-1 flex-row items-center gap-1">
        {showAttach ? (
          <Pressable
            accessibilityHint="Attaches a photo or a file to your message"
            accessibilityLabel="Add attachment"
            accessibilityRole="button"
            className="h-10 w-10 items-center justify-center rounded-full active:bg-raised"
            onPress={onAttach}
            testID="composer-attach"
          >
            <Icon name="plus" size={26} />
          </Pressable>
        ) : null}
        {showReasoning && reasoning ? (
          <Pressable
            accessibilityHint="Chooses how much the model thinks before answering"
            accessibilityLabel={`Reasoning: ${reasoning.label}`}
            accessibilityRole="button"
            className={cn(
              "h-9 flex-row items-center gap-1 rounded-full pl-2 pr-1.5 active:bg-raised",
              !showAttach && "ml-1",
            )}
            onPress={reasoning.onPress}
            testID="composer-reasoning"
          >
            <Icon name="lightbulb-outline" size={18} tone="textMuted" />
            <Text className="text-[15px] font-medium text-text-muted" numberOfLines={1}>
              {reasoning.label}
            </Text>
            <Icon name="chevron-down" size={16} tone="textMuted" />
          </Pressable>
        ) : null}
        <View className="flex-1" />
        {streaming ? (
          <Pressable
            accessibilityHint="Stops the current response"
            accessibilityLabel="Stop generating"
            accessibilityRole="button"
            accessibilityState={{ busy: true }}
            className="h-10 w-10 items-center justify-center rounded-full bg-primary active:opacity-80"
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
              "h-10 w-10 items-center justify-center rounded-full",
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
}
