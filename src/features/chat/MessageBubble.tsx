import * as Clipboard from "expo-clipboard";
import { memo, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { Text } from "@/src/ui/Text";
import { Pressable } from "@/src/ui/Pressable";
import type { Message, TurnActivity } from "@/src/domain";
import { MarkdownContent } from "@/src/features/markdown/MarkdownContent";
import { useCopyToClipboard } from "@/src/lib/clipboard";
import { AttachmentStrip } from "./AttachmentChips";
import { layoutReply, type ReplyBlock } from "./replyLayout";
import { WorkRow } from "./WorkRow";
import { Bubble } from "@/src/ui";
import { cn } from "@/src/lib/cn";
import { Icon } from "@/src/ui/Icon";
import { Menu, type MenuItem } from "@/src/ui/Menu";
import { Sheet } from "@/src/ui/Sheet";

export interface MessageBubbleProps {
  message: Message;
  showReasoning: boolean;
  /** What the live turn is doing; only the reply being written receives it. */
  activity?: TurnActivity | null;
  /** Set only on the newest reply while no turn is live. */
  onRegenerate?: () => void;
  /** Set only on the user message that can be edited: the newest, while no turn is live. */
  onEdit?: (message: Message) => void;
  /** The message is being edited in the composer. */
  dimmed?: boolean;
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

function CopyButton({ text, label, testID }: { text: string; label: string; testID: string }) {
  const { copied, copy } = useCopyToClipboard();
  return (
    <Pressable
      accessibilityLabel={copied ? "Copied" : label}
      accessibilityRole="button"
      className="h-9 w-9 items-center justify-center rounded-full active:bg-surface"
      onPress={() => copy(text)}
      testID={testID}
    >
      <Icon name={copied ? "check" : "content-copy"} size={17} tone="textMuted" />
    </Pressable>
  );
}

/**
 * The user's own text. A long press opens its menu: copy, select text (in a
 * sheet, since the bubble's text is not selectable in place) and, on the
 * message that allows it, edit.
 */
function UserText({ message, onEdit }: { message: Message; onEdit?: (message: Message) => void }) {
  const [menuAt, setMenuAt] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);

  const items: MenuItem[] = [
    {
      label: "Copy",
      icon: "content-copy",
      onPress: () => void Clipboard.setStringAsync(message.text).catch(() => undefined),
      testID: "message-menu-copy",
    },
    {
      label: "Select text",
      icon: "cursor-text",
      onPress: () => setSelecting(true),
      testID: "message-menu-select",
    },
  ];
  if (onEdit) {
    items.push({
      label: "Edit",
      icon: "pencil-outline",
      onPress: () => onEdit(message),
      testID: "message-menu-edit",
    });
  }

  return (
    <>
      <Bubble
        role="user"
        status={statusFor(message)}
        onLongPress={(event) => {
          setMenuAt(event.nativeEvent.pageY + 12);
          setMenuOpen(true);
        }}
      >
        <MarkdownContent
          role="user"
          streaming={false}
          text={message.text}
          testID={`markdown-${message.id}`}
        />
      </Bubble>
      <Menu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={items}
        anchor={{ y: menuAt ?? 0, side: "right", inset: 16 }}
        testID="message-menu"
      />
      <Sheet
        visible={selecting}
        onClose={() => setSelecting(false)}
        title="Select text"
        testID="select-text-sheet"
      >
        <ScrollView className="max-h-96 px-2">
          <Text selectable className="text-base leading-6 text-text">
            {message.text}
          </Text>
        </ScrollView>
      </Sheet>
    </>
  );
}

export const MessageBubble = memo(function MessageBubble({
  message,
  showReasoning,
  activity = null,
  onRegenerate,
  onEdit,
  dimmed = false,
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
      <View className={cn("mb-4 mt-2", dimmed && "opacity-50")} testID={`bubble-${message.role}`}>
        {attachments.length > 0 ? (
          <View className={hasText ? "mb-1.5 px-4" : "px-4"}>
            <AttachmentStrip
              attachments={attachments}
              testID={`message-attachments-${message.id}`}
            />
          </View>
        ) : null}
        {hasText ? <UserText message={message} onEdit={onEdit} /> : null}
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
