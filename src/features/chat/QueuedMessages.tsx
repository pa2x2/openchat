import { useTranslation } from "react-i18next";
import { View } from "react-native";
import type { QueuedMessage } from "@/src/domain";
import { Icon } from "@/src/ui/Icon";
import { Pressable } from "@/src/ui/Pressable";
import { Text } from "@/src/ui/Text";
import { cn } from "@/src/lib/cn";
import { bodyAfterQuotes } from "@/src/lib/quotes";
import { AttachmentStrip } from "./AttachmentChips";

export interface QueuedMessagesProps {
  messages: QueuedMessage[];
  onSendNow: (message: QueuedMessage) => void;
  onCancel: (message: QueuedMessage) => void;
}

/**
 * Messages sent during a reply, under it at the end of the transcript until
 * the backend takes them in. Outlined instead of filled: they are not part of
 * the conversation yet.
 */
export function QueuedMessages({ messages, onSendNow, onCancel }: QueuedMessagesProps) {
  return (
    <View testID="queued-messages">
      {messages.map((message) => (
        <QueuedBubble
          key={message.id}
          message={message}
          onSendNow={onSendNow}
          onCancel={onCancel}
        />
      ))}
    </View>
  );
}

function QueuedBubble({
  message,
  onSendNow,
  onCancel,
}: { message: QueuedMessage } & Omit<QueuedMessagesProps, "messages">) {
  const { t } = useTranslation();
  const steering = message.delivery === "steer";
  const status = steering ? t("queue.sending") : t("queue.queued");
  const attachments = message.attachments ?? [];
  const body = message.quotes ? bodyAfterQuotes(message.text, message.quotes) : null;
  // With only quotes, the first one stands in for the text.
  const shown = body === null ? message.text : body || (message.quotes?.[0]?.text ?? "");
  return (
    <View className="mb-3 px-4 opacity-80" testID={`queued-${message.id}`}>
      {attachments.length > 0 ? (
        <View className="mb-1.5">
          <AttachmentStrip attachments={attachments} />
        </View>
      ) : null}
      <View className="max-w-[82%] self-end rounded-[22px] border border-dashed border-border pb-1 pl-4 pr-1.5 pt-2.5">
        {shown ? (
          <View className="flex-row gap-1.5 pr-2.5">
            {body !== null ? (
              <View className="pt-1">
                <Icon name="format-quote-open" size={16} tone="textMuted" />
              </View>
            ) : null}
            <Text
              className={cn(
                "shrink text-base leading-[23px]",
                body === "" ? "text-text-muted" : "text-text",
              )}
              numberOfLines={body === "" ? 3 : undefined}
            >
              {shown}
            </Text>
          </View>
        ) : null}
        <View className="mt-1 flex-row items-center gap-4">
          <View
            accessible
            accessibilityLabel={status}
            className="flex-row items-center gap-1"
            testID="queued-status"
          >
            <Icon
              name={steering ? "send-clock-outline" : "clock-outline"}
              size={14}
              tone="textMuted"
            />
            <Text className="text-xs text-text-muted">{status}</Text>
          </View>
          <View className="ml-auto flex-row">
            {/* A steered message already goes in at the next chance. */}
            {steering ? null : (
              <Pressable
                accessibilityHint={t("queue.sendNowHint")}
                accessibilityLabel={t("queue.sendNow")}
                accessibilityRole="button"
                className="h-8 w-8 items-center justify-center rounded-full active:bg-raised"
                hitSlop={4}
                onPress={() => onSendNow(message)}
                testID="queued-send-now"
              >
                <Icon name="arrow-up" size={18} tone="textMuted" />
              </Pressable>
            )}
            <Pressable
              accessibilityLabel={t("queue.cancel")}
              accessibilityRole="button"
              className="h-8 w-8 items-center justify-center rounded-full active:bg-raised"
              hitSlop={4}
              onPress={() => onCancel(message)}
              testID="queued-cancel"
            >
              <Icon name="close" size={18} tone="textMuted" />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}
