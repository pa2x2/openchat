import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import type { Message } from "@/src/domain";
import { MarkdownContent } from "@/src/features/markdown/MarkdownContent";
import { ReasoningDrawer } from "@/src/features/markdown/ReasoningDrawer";
import { AttachmentStrip } from "./AttachmentChips";
import { Bubble } from "@/src/ui";
import { Icon } from "@/src/ui/Icon";
import { Pulse } from "@/src/ui/Pulse";

export interface MessageBubbleProps {
  message: Message;
  showReasoning: boolean;
  /**
   * When set, the reply offers a regenerate action. The screen passes it
   * only for a reply that can actually be re-run (gated by the provider's
   * regenerate capability and no live turn).
   */
  onRegenerate?: () => void;
}

/** A terminal outcome worth a line under the reply; live states show inline. */
function statusFor(message: Message): string | undefined {
  switch (message.status) {
    case "error":
      return "Something went wrong";
    case "interrupted":
      return "Stopped";
    default:
      return undefined;
  }
}

export const MessageBubble = memo(function MessageBubble({
  message,
  showReasoning,
  onRegenerate,
}: MessageBubbleProps) {
  const streaming = message.status === "pending" || message.status === "streaming";
  const attachments = message.attachments ?? [];
  const isUser = message.role === "user";
  const hasText = message.text.length > 0;
  const hasReasoning = showReasoning && Boolean(message.reasoning?.trim());

  if (isUser) {
    return (
      <View className="mb-4 mt-2" testID={`bubble-${message.role}`}>
        {attachments.length > 0 ? (
          <View className={hasText ? "mb-1.5 px-4" : "px-4"}>
            <AttachmentStrip
              attachments={attachments}
              testID={`message-attachments-${message.id}`}
            />
          </View>
        ) : null}
        {hasText ? (
          <Bubble role="user" status={statusFor(message)}>
            <MarkdownContent
              role="user"
              streaming={false}
              text={message.text}
              testID={`markdown-${message.id}`}
            />
          </Bubble>
        ) : null}
      </View>
    );
  }

  const status = statusFor(message);
  return (
    <Bubble role="assistant" className="mb-5 mt-1" testID={`bubble-${message.role}`}>
      <ReasoningDrawer
        enabled={showReasoning}
        streaming={streaming && !hasText}
        text={message.reasoning}
      />
      {streaming && !hasText && !hasReasoning ? (
        <Pulse>
          <Text className="py-1 text-[15px] text-text-muted" testID="thinking-indicator">
            Thinking…
          </Text>
        </Pulse>
      ) : null}
      {hasText ? (
        <MarkdownContent
          role="assistant"
          streaming={streaming}
          text={message.text}
          testID={`markdown-${message.id}`}
        />
      ) : null}
      {status ? (
        <Text
          accessibilityLabel={status}
          className={
            message.status === "error" ? "mt-1 text-sm text-danger" : "mt-1 text-sm text-text-muted"
          }
        >
          {status}
        </Text>
      ) : null}
      {!streaming && onRegenerate ? (
        <Pressable
          accessibilityHint="Runs this reply again and replaces it"
          accessibilityLabel="Regenerate reply"
          accessibilityRole="button"
          className="-ml-2 mt-1 h-9 w-9 items-center justify-center rounded-full active:bg-surface"
          onPress={onRegenerate}
          testID="regenerate-button"
        >
          <Icon name="refresh" size={19} tone="textMuted" />
        </Pressable>
      ) : null}
    </Bubble>
  );
});

