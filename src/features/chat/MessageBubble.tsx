import * as Clipboard from "expo-clipboard";
import { memo, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { Message, TurnActivity } from "@/src/domain";
import { MarkdownContent } from "@/src/features/markdown/MarkdownContent";
import { ReasoningDrawer } from "@/src/features/markdown/ReasoningDrawer";
import { ActivityIndicator } from "./ActivityIndicator";
import { AttachmentStrip } from "./AttachmentChips";
import { Bubble } from "@/src/ui";
import { Icon } from "@/src/ui/Icon";

export interface MessageBubbleProps {
  message: Message;
  showReasoning: boolean;
  /** What the live turn is doing; only the reply being written receives it. */
  activity?: TurnActivity | null;
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

const COPIED_MS = 1500;

const THINKING: TurnActivity = { kind: "thinking" };

function CopyButton({ text, label, testID }: { text: string; label: string; testID: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function handleCopy() {
    void Clipboard.setStringAsync(text).catch(() => undefined);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }

  return (
    <Pressable
      accessibilityLabel={copied ? "Copied" : label}
      accessibilityRole="button"
      className="h-9 w-9 items-center justify-center rounded-full active:bg-surface"
      onPress={handleCopy}
      testID={testID}
    >
      <Icon name={copied ? "check" : "content-copy"} size={17} tone="textMuted" />
    </Pressable>
  );
}

export const MessageBubble = memo(function MessageBubble({
  message,
  showReasoning,
  activity = null,
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
        {hasText ? (
          <View className="-mr-2 mt-1 flex-row self-end px-4">
            <CopyButton label="Copy message" testID="copy-message-button" text={message.text} />
          </View>
        ) : null}
      </View>
    );
  }

  const status = statusFor(message);
  // Before any text the reply is at least thinking; once text flows, the
  // indicator only returns when the run pauses it for something else.
  const live = streaming ? (activity ?? (hasText ? null : THINKING)) : null;
  // The reasoning drawer already says "Thinking…" while it fills.
  const drawerThinking = streaming && !hasText && live?.kind === "thinking";
  return (
    <Bubble role="assistant" className="mb-5 mt-1" testID={`bubble-${message.role}`}>
      <ReasoningDrawer
        enabled={showReasoning}
        streaming={drawerThinking}
        text={message.reasoning}
      />
      {live && !hasText && !(hasReasoning && drawerThinking) ? (
        <ActivityIndicator activity={live} />
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
      {streaming ? (
        // Holds the action row's place so the reply doesn't jump when it ends.
        <View className="mt-1 h-9 justify-center">
          {live && hasText ? <ActivityIndicator activity={live} /> : null}
        </View>
      ) : hasText || onRegenerate ? (
        <View className="-ml-2 mt-1 flex-row">
          {hasText ? (
            <CopyButton label="Copy reply" testID="copy-reply-button" text={message.text} />
          ) : null}
          {onRegenerate ? (
            <Pressable
              accessibilityHint="Runs this reply again and replaces it"
              accessibilityLabel="Regenerate reply"
              accessibilityRole="button"
              className="h-9 w-9 items-center justify-center rounded-full active:bg-surface"
              onPress={onRegenerate}
              testID="regenerate-button"
            >
              <Icon name="refresh" size={19} tone="textMuted" />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Bubble>
  );
});
