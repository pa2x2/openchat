/**
 * The chats used last, offered above the composer on a chat not yet started.
 * The app always opens on a new chat, and the way back to the last
 * conversation is otherwise through the sidebar.
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import type { ChatId } from "@/src/domain";
import { chatTitle } from "@/src/lib/chatTitle";
import { formatRelative } from "@/src/lib/time";
import { useChatsStore } from "@/src/stores/chats";
import { Pressable } from "@/src/ui/Pressable";
import { Icon } from "@/src/ui/Icon";
import { Text } from "@/src/ui/Text";

const RECENT_COUNT = 3;

export function RecentChats({ onOpen }: { onOpen: (id: ChatId) => void }) {
  const { t } = useTranslation();
  const chats = useChatsStore((state) => state.chats);
  const temporary = useChatsStore((state) => state.temporary);
  // The store keeps the list newest first.
  const recent = useMemo(
    () => chats.filter((chat) => !temporary[chat.id]).slice(0, RECENT_COUNT),
    [chats, temporary],
  );
  if (recent.length === 0) return null;

  return (
    <View className="mb-2" testID="recent-chats">
      <Text className="px-3 pb-1 text-[13px] font-medium text-text-muted">{t("chat.recent")}</Text>
      {recent.map((chat) => {
        const title = chatTitle(chat.title);
        return (
          <Pressable
            key={chat.id}
            accessibilityRole="button"
            accessibilityLabel={chat.branchedFrom ? t("chat.titleBranch", { title }) : title}
            className="h-11 flex-row items-center gap-3 rounded-[14px] px-3 active:bg-surface"
            onPress={() => onOpen(chat.id)}
            testID={`recent-chat-${chat.id}`}
          >
            {chat.branchedFrom ? <Icon name="source-branch" size={17} tone="textMuted" /> : null}
            <Text className="flex-1 text-[15.5px] text-text" numberOfLines={1}>
              {title}
            </Text>
            <Text className="text-[13px] text-text-muted">{formatRelative(chat.updatedAt)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
