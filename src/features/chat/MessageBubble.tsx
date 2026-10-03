import * as Clipboard from "expo-clipboard";
import { memo, useMemo, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/src/ui/Text";
import { Pressable } from "@/src/ui/Pressable";
import { totalTokens, type Message, type TurnActivity } from "@/src/domain";
import { MarkdownContent } from "@/src/features/markdown/MarkdownContent";
import { useCopyToClipboard } from "@/src/lib/clipboard";
import { AttachmentStrip } from "./AttachmentChips";
import { FormResultCard } from "./FormResultCard";
import { ReplyDetails } from "./ReplyDetails";
import { layoutReply, type ReplyBlock } from "./replyLayout";
import { formatCost, formatTokensShort } from "./usageFormat";
import { WorkRow } from "./WorkRow";
import { Bubble } from "@/src/ui";
import { Button } from "@/src/ui/Button";
import { cn } from "@/src/lib/cn";
import { Icon } from "@/src/ui/Icon";
import { Menu, type MenuItem } from "@/src/ui/Menu";
import { Modal } from "@/src/ui/Modal";
import { useAppTheme, withAlpha } from "@/src/ui/theme";

export interface MessageBubbleProps {
  message: Message;
  showReasoning: boolean;
  /** What the live turn is doing; only the reply being written receives it. */
  activity?: TurnActivity | null;
  /** Set only on the newest reply while no turn is live. */
  onRegenerate?: () => void;
  /** Set only on user messages that can be edited, which is none while a turn is live. */
  onEdit?: (message: Message) => void;
  /** Set only on replies while no turn is live. */
  onBranch?: (message: Message) => void;
  /** The user message being edited in the composer. */
  editing?: boolean;
  /** The message comes after the one being edited, and goes with the edit. */
  dimmed?: boolean;
  /** Why a failed reply failed, when it is known. */
  error?: string | null;
}

/** A terminal outcome worth a line under the message; live states show inline, errors in a card. */
function statusFor(message: Message, t: TFunction): string | undefined {
  return message.status === "interrupted" ? t("reply.stopped") : undefined;
}

function CopyButton({ text, label, testID }: { text: string; label: string; testID: string }) {
  const { t } = useTranslation();
  const { copied, copy } = useCopyToClipboard();
  return (
    <Pressable
      accessibilityLabel={copied ? t("common.copied") : label}
      accessibilityRole="button"
      className="h-9 w-9 items-center justify-center rounded-full active:bg-surface"
      onPress={() => copy(text)}
      testID={testID}
    >
      <Icon name={copied ? "check" : "content-copy"} size={17} tone="textMuted" />
    </Pressable>
  );
}

/** What a running reply has used so far; it moves when a step ends, not as text arrives. */
function runningCount(message: Message, t: TFunction): string | null {
  if (!message.usage) return null;
  const used = [
    t("context.tokenCount", { tokens: formatTokensShort(totalTokens(message.usage)) }),
    formatCost(message.cost),
  ]
    .filter(Boolean)
    .join(" · ");
  return t("reply.soFar", { used });
}

function ReplyError({ error, onRetry }: { error: string | null; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <View
      accessibilityLiveRegion="polite"
      className="mt-2.5 flex-row items-start gap-3 rounded-[18px] bg-surface px-3.5 py-3"
      testID="reply-error"
    >
      <View className="pt-px">
        <Icon name="alert-circle-outline" size={20} tone="danger" />
      </View>
      <View className="flex-1">
        <Text className="text-[15px] font-medium text-text">{t("reply.failedTitle")}</Text>
        {error ? (
          <Text className="mt-0.5 text-[13.5px] leading-[18px] text-text-muted">{error}</Text>
        ) : null}
        {onRetry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityHint={t("reply.regenerateHint")}
            className="mt-2.5 h-9 flex-row items-center gap-1.5 self-start rounded-full bg-raised-hover px-3.5 active:opacity-80"
            onPress={onRetry}
            testID="reply-retry"
          >
            <Icon name="refresh" size={17} />
            <Text className="text-sm font-medium text-text">{t("reply.retry")}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The message's text, selectable, over the whole screen. A full-screen view
 * rather than a sheet: a sheet's drag-to-dismiss takes the long press that
 * starts a selection.
 */
function SelectText({ text, onClose }: { text: string; onClose: () => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <View className="h-14 justify-center px-5">
          <Text className="text-lg font-medium text-text">{t("message.selectText")}</Text>
        </View>
        <ScrollView contentContainerClassName="px-5 pb-6 pt-2">
          <Text
            selectable
            selectionColor={withAlpha(colors.primary, 0.35)}
            className="text-base leading-6 text-text"
            testID="select-text"
          >
            {text}
          </Text>
        </ScrollView>
        <View className="px-4 pt-2" style={{ paddingBottom: insets.bottom + 12 }}>
          <Button
            label={t("common.done")}
            variant="secondary"
            onPress={onClose}
            testID="select-text-close"
          />
        </View>
      </View>
    </Modal>
  );
}

/**
 * The user's own text. A long press opens its menu: copy, select text (in a
 * view of its own, since the bubble's text is not selectable in place) and,
 * on the message that allows it, edit.
 */
function UserText({
  message,
  onEdit,
  editing,
}: {
  message: Message;
  onEdit?: (message: Message) => void;
  editing: boolean;
}) {
  const { t } = useTranslation();
  const [menuAt, setMenuAt] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);

  const items: MenuItem[] = [
    {
      label: t("message.copy"),
      icon: "content-copy",
      onPress: () => void Clipboard.setStringAsync(message.text).catch(() => undefined),
      testID: "message-menu-copy",
    },
    {
      label: t("message.selectText"),
      icon: "cursor-text",
      onPress: () => setSelecting(true),
      testID: "message-menu-select",
    },
  ];
  if (onEdit) {
    items.push({
      label: t("message.edit"),
      icon: "pencil-outline",
      onPress: () => onEdit(message),
      testID: "message-menu-edit",
    });
  }

  return (
    <>
      <Bubble
        role="user"
        status={statusFor(message, t)}
        highlighted={editing}
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
      {selecting ? <SelectText text={message.text} onClose={() => setSelecting(false)} /> : null}
    </>
  );
}

export const MessageBubble = memo(function MessageBubble({
  message,
  showReasoning,
  activity = null,
  onRegenerate,
  onEdit,
  onBranch,
  editing = false,
  dimmed = false,
  error = null,
}: MessageBubbleProps) {
  const { t } = useTranslation();
  const streaming = message.status === "pending" || message.status === "streaming";
  const attachments = message.attachments ?? [];
  const isUser = message.role === "user";
  const hasText = message.text.length > 0;
  const [foldOpen, setFoldOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const layout = useMemo(
    () => (isUser ? null : layoutReply(message, { showReasoning, activity, t })),
    [isUser, message, showReasoning, activity, t],
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
        {hasText ? <UserText message={message} onEdit={onEdit} editing={editing} /> : null}
      </View>
    );
  }

  const status = statusFor(message, t);
  const failed = message.status === "error";
  const hasDetails = message.usage !== undefined;
  // Retry sits in the error card, so a failed reply offers no regenerate here.
  const canRegenerate = Boolean(onRegenerate) && !failed;
  const canBranch = Boolean(onBranch) && !failed;
  const running = streaming ? runningCount(message, t) : null;
  const lastBlock = layout.blocks.at(-1);
  const renderBlock = (block: ReplyBlock) =>
    block.type === "work" ? (
      <WorkRow key={block.key} block={block} />
    ) : block.type === "form" ? (
      <FormResultCard key={block.key} form={block.form} />
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
    <Bubble
      role="assistant"
      className={cn("mb-5 mt-1", dimmed && "opacity-50")}
      testID={`bubble-${message.role}`}
    >
      {layout.fold ? (
        <View className="mb-1 self-stretch">
          <Pressable
            accessibilityHint={foldOpen ? t("reply.hideFold") : t("reply.showFold")}
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
      {status && !layout.fold ? (
        <Text accessibilityLabel={status} className="mt-1 text-sm text-text-muted">
          {status}
        </Text>
      ) : null}
      {failed ? <ReplyError error={error} onRetry={onRegenerate} /> : null}
      {streaming ? (
        // Holds the action row's place so the reply doesn't jump when it ends.
        <View className="mt-1 h-9 justify-center">
          {running ? (
            <Text className="text-[13px] text-text-muted" testID="reply-running-count">
              {running}
            </Text>
          ) : null}
        </View>
      ) : layout.answer || canRegenerate || canBranch || hasDetails ? (
        <View className="-ml-2 mt-1 flex-row">
          {layout.answer ? (
            <CopyButton label={t("reply.copy")} testID="copy-reply-button" text={layout.answer} />
          ) : null}
          {canRegenerate ? (
            <Pressable
              accessibilityHint={t("reply.regenerateHint")}
              accessibilityLabel={t("reply.regenerate")}
              accessibilityRole="button"
              className="h-9 w-9 items-center justify-center rounded-full active:bg-surface"
              onPress={onRegenerate}
              testID="regenerate-button"
            >
              <Icon name="refresh" size={19} tone="textMuted" />
            </Pressable>
          ) : null}
          {canBranch ? (
            <Pressable
              accessibilityHint={t("reply.branchHint")}
              accessibilityLabel={t("reply.branch")}
              accessibilityRole="button"
              className="h-9 w-9 items-center justify-center rounded-full active:bg-surface"
              onPress={() => onBranch?.(message)}
              testID="branch-button"
            >
              <Icon name="source-branch" size={19} tone="textMuted" />
            </Pressable>
          ) : null}
          {hasDetails ? (
            <Pressable
              accessibilityHint={detailsOpen ? t("reply.hideDetails") : t("reply.showDetails")}
              accessibilityLabel={t("reply.details")}
              accessibilityRole="button"
              accessibilityState={{ expanded: detailsOpen }}
              className={cn(
                "h-9 w-9 items-center justify-center rounded-full active:bg-surface",
                detailsOpen && "bg-surface",
              )}
              onPress={() => setDetailsOpen((current) => !current)}
              testID="reply-details-button"
            >
              <Icon
                name="information-outline"
                size={19}
                tone={detailsOpen ? "text" : "textMuted"}
              />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {detailsOpen && hasDetails && !streaming ? <ReplyDetails message={message} /> : null}
    </Bubble>
  );
});
