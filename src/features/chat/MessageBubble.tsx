import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import type { Message } from "@/src/domain";
import { MarkdownContent } from "@/src/features/markdown/MarkdownContent";
import { ReasoningDrawer } from "@/src/features/markdown/ReasoningDrawer";
import { AttachmentStrip } from "./AttachmentChips";
import { Bubble } from "@/src/ui";

export interface MessageBubbleProps {
  message: Message;
  showReasoning: boolean;
  /**
   * When set, the bubble offers a regenerate action. The screen passes it
   * only for a reply that can actually be re-run (gated by the provider's
   * regenerate capability and no live turn).
   */
  onRegenerate?: () => void;
}

function statusFor(message: Message): string | undefined {
  switch (message.status) {
    case "pending":
      return "Starting…";
    case "streaming":
      return "Generating…";
    case "error":
      return "Failed";
    case "interrupted":
      return "Stopped";
    case "complete":
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

  return (
    <Bubble
      role={message.role}
      status={statusFor(message)}
      testID={`bubble-${message.role}`}
      text={message.text}
    >
      {attachments.length > 0 ? (
        <View className={message.text ? "mb-2" : undefined}>
          <AttachmentStrip attachments={attachments} testID={`message-attachments-${message.id}`} />
        </View>
      ) : null}
      <MarkdownContent
        role={message.role}
        streaming={streaming}
        text={message.text}
        testID={`markdown-${message.id}`}
      />
      {message.role === "assistant" ? (
        <ReasoningDrawer enabled={showReasoning} streaming={streaming} text={message.reasoning} />
      ) : null}
      {onRegenerate && !streaming ? (
        <Pressable
          accessibilityHint="Runs this reply again and replaces it"
          accessibilityLabel="Regenerate reply"
          accessibilityRole="button"
          className="mt-1 self-start rounded-lg px-2 py-1 active:bg-surface-hover"
          onPress={onRegenerate}
          testID="regenerate-button"
        >
          <Text className="text-xs font-semibold text-text-muted">Regenerate</Text>
        </Pressable>
      ) : null}
    </Bubble>
  );
});
