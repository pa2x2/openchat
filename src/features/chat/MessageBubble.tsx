import * as Clipboard from "expo-clipboard";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Pressable } from "@/src/ui/Pressable";
import type { Message, TurnActivity } from "@/src/domain";
import { MarkdownContent } from "@/src/features/markdown/MarkdownContent";
import { AttachmentStrip } from "./AttachmentChips";
import { layoutReply, type ReplyBlock } from "./replyLayout";
import { WorkRow } from "./WorkRow";
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
  const [foldOpen, setFoldOpen] = useState(false);
  const layout = useMemo(
    () => (isUser ? null : layoutReply(message, { showReasoning, activity })),
    [isUser, message, showReasoning, activity],
  );

  if (isUser || !layout) {
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
  const lastBlock = layout.blocks.at(-1);
  const renderBlock = (block: ReplyBlock) =>
    block.type === "work" ? (
      <WorkRow key={block.key} block={block} />
    ) : (
      <View key={block.key} className="my-0.5">
        <MarkdownContent
          role="assistant"
          streaming={streaming && block === lastBlock}
          text={block.text}
          testID={`markdown-${message.id}-${block.key}`}
        />
      </View>
    );
  return (
    <Bubble role="assistant" className="mb-5 mt-1" testID={`bubble-${message.role}`}>
      {layout.fold ? (
        <View className="mb-1 self-stretch">
          <Pressable
            accessibilityHint={
              foldOpen ? "Hides how the reply was worked out" : "Shows how the reply was worked out"
            }
            accessibilityLabel={layout.fold.label}
            accessibilityRole="button"
            accessibilityState={{ expanded: foldOpen }}
            className="flex-row items-center gap-1 self-start py-1"
            hitSlop={6}
            onPress={() => setFoldOpen((current) => !current)}
            testID="reply-fold"
          >
            <Text className="text-[15px] text-text-muted">{layout.fold.label}</Text>
            <Icon name={foldOpen ? "chevron-down" : "chevron-right"} size={18} tone="textMuted" />
          </Pressable>
          {foldOpen ? (
            <View className="mt-1 border-b border-border pb-2">
              {layout.fold.blocks.map(renderBlock)}
            </View>
          ) : null}
        </View>
      ) : null}
      {layout.blocks.map(renderBlock)}
      {/* The fold already says a stopped reply was stopped. */}
      {status && !(layout.fold && message.status === "interrupted") ? (
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
        <View className="mt-1 h-9" />
      ) : layout.answer || onRegenerate ? (
        <View className="-ml-2 mt-1 flex-row">
          {layout.answer ? (
            <CopyButton label="Copy reply" testID="copy-reply-button" text={layout.answer} />
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
