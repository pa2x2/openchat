/**
 * The chats used last, offered above the composer on a chat not yet started.
 * The app always opens on a new chat, and the way back to the last
 * conversation is otherwise the first row of the sidebar, at the top of the
 * screen.
 */

import { useMemo } from "react";
import { View } from "react-native";
import type { ChatId } from "@/src/domain";
import { formatRelative } from "@/src/lib/time";
import { useChatsStore } from "@/src/stores/chats";
import { Pressable } from "@/src/ui/Pressable";
import { Text } from "@/src/ui/Text";

const RECENT_COUNT = 3;

export function RecentChats({ onOpen }: { onOpen: (id: ChatId) => void }) {
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
      <Text className="px-3 pb-1 text-[13px] font-medium text-text-muted">Recent</Text>
      {recent.map((chat) => {
        const title = chat.title || "Untitled";
        return (
          <Pressable
            key={chat.id}
            accessibilityRole="button"
            accessibilityLabel={title}
            className="h-11 flex-row items-center gap-3 rounded-[14px] px-3 active:bg-surface"
            onPress={() => onOpen(chat.id)}
            testID={`recent-chat-${chat.id}`}
          >
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
