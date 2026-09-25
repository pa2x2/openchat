import { memo } from "react";
import type { Message } from "@/src/domain";
import type { ColorSchemeName } from "@/src/ui/theme";
import { MarkdownContent } from "@/src/features/markdown/MarkdownContent";
import { ReasoningDrawer } from "@/src/features/markdown/ReasoningDrawer";
import { Bubble } from "@/src/ui";

export interface MessageBubbleProps {
  message: Message;
  colorScheme: ColorSchemeName;
  showReasoning: boolean;
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
  colorScheme,
  showReasoning,
}: MessageBubbleProps) {
  const streaming = message.status === "pending" || message.status === "streaming";

  return (
    <Bubble
      role={message.role}
      status={statusFor(message)}
      testID={`bubble-${message.role}`}
      text={message.text}
    >
      <MarkdownContent
        colorScheme={colorScheme}
        role={message.role}
        streaming={streaming}
        text={message.text}
        testID={`markdown-${message.id}`}
      />
      {message.role === "assistant" ? (
        <ReasoningDrawer enabled={showReasoning} streaming={streaming} text={message.reasoning} />
      ) : null}
    </Bubble>
  );
});
