/**
 * Sidebar: search, new chat, every conversation the server knows about
 * (newest first, cached locally for instant launch), and the connected
 * server at the bottom, which leads to Settings.
 */

import { memo, useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ChatId, ChatSummary } from "@/src/domain";
import { cn } from "@/src/lib/cn";
import { getProvider, useProviderCapabilities } from "@/src/lib/providerFactory";
import { useChatsStore } from "@/src/stores/chats";
import { useConnectionStore } from "@/src/stores/connection";
import { useMessagesStore } from "@/src/stores/messages";
import { showDialog } from "@/src/ui/Dialog";
import { Icon } from "@/src/ui/Icon";
import { useAppTheme } from "@/src/ui/theme";

export interface ChatDrawerProps {
  activeChatId?: string;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
  /** Called after the active chat is deleted, so the screen can move on. */
  onDeletedActive: () => void;
}

/** Removes a chat on the server and locally, after asking. */
export function confirmDeleteChat(chat: Pick<ChatSummary, "id" | "title">, onDeleted?: () => void) {
  showDialog({
    title: "Delete chat?",
    message: `This will delete “${chat.title || "this chat"}”.`,
    actions: [
      { label: "Cancel", style: "cancel" },
      { label: "Delete", style: "destructive", onPress: () => void deleteChat(chat.id, onDeleted) },
    ],
  });
}

/**
 * Deletes on the server, then locally. A chat the server still has stays in
 * the list, since the next refresh would bring it back anyway.
 */
export async function deleteChat(id: ChatId, onDeleted?: () => void): Promise<void> {
  try {
    const provider = await getProvider();
    if (!provider) throw new Error("Not connected. Open Settings to connect to a server.");
    await provider.deleteChat(id);
  } catch (error) {
    showDialog({
      title: "Could not delete chat",
      message: error instanceof Error && error.message ? error.message : "Try again later.",
    });
    return;
  }
  useChatsStore.getState().remove(id);
  useMessagesStore.getState().removeChat(id);
  onDeleted?.();
}

export function ChatDrawer({
  activeChatId,
  onSelectChat,
  onNewChat,
  onOpenSettings,
  onDeletedActive,
}: ChatDrawerProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const chats = useChatsStore((state) => state.chats);
  const refreshChats = useChatsStore((state) => state.refresh);
  const capabilities = useProviderCapabilities();
  const profile = useConnectionStore((state) => state.profile);
  const chatsError = useChatsStore((state) => state.error);
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return chats;
    return chats.filter((chat) => (chat.title || "Untitled").toLowerCase().includes(needle));
  }, [chats, query]);

  const canDelete = capabilities?.deleteChat === true;
  const renderChat = useCallback(
    ({ item }: { item: ChatSummary }) => (
      <ChatRow
        chat={item}
        active={item.id === activeChatId}
        canDelete={canDelete}
        onSelect={onSelectChat}
        onDeletedActive={onDeletedActive}
      />
    ),
    [activeChatId, canDelete, onSelectChat, onDeletedActive],
  );

  async function handleRefresh() {
    setRefreshing(true);
    await refreshChats();
    setRefreshing(false);
  }

  const serverLabel = profile ? profile.baseUrl.replace(/^https?:\/\//, "") : "Not connected";
  // Live connection status resets on restart, so the last chat-list refresh
  // is the better signal of whether the server is reachable.
  const statusTone = !profile ? "bg-text-faint" : chatsError ? "bg-danger" : "bg-success";

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top + 8 }}
      testID="chat-drawer"
    >
      <View className="flex-row items-center gap-2 px-3 pb-2">
        <View className="h-11 flex-1 flex-row items-center gap-2.5 rounded-full bg-surface px-3.5">
          <Icon name="magnify" size={20} tone="textMuted" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search"
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="Search chats"
            className="h-11 flex-1 text-base text-text"
            returnKeyType="search"
            testID="drawer-search"
          />
          {query ? (
            <Pressable accessibilityLabel="Clear search" hitSlop={8} onPress={() => setQuery("")}>
              <Icon name="close" size={18} tone="textMuted" />
            </Pressable>
          ) : null}
        </View>
      </View>

      <FlatList
        data={visible}
        keyExtractor={(chat) => chat.id}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="px-2 pb-3"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void handleRefresh()}
            colors={[colors.primary]}
            progressBackgroundColor={colors.elevated}
            tintColor={colors.textMuted}
          />
        }
        ListHeaderComponent={
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New chat"
              className="h-12 flex-row items-center gap-3.5 rounded-[14px] px-3 active:bg-surface"
              onPress={onNewChat}
              testID="drawer-new-chat"
            >
              <Icon name="square-edit-outline" size={21} />
              <Text className="text-base text-text">New chat</Text>
            </Pressable>
            <Text className="px-3 pb-1.5 pt-5 text-[13.5px] font-medium text-text-muted">
              Chats
            </Text>
          </>
        }
        renderItem={renderChat}
        ListEmptyComponent={
          <Text className="px-3 py-2 text-sm text-text-muted">
            {query ? "No matching chats" : "No chats yet"}
          </Text>
        }
      />

      <View
        className="border-t border-border px-3 pt-2.5"
        style={{ paddingBottom: insets.bottom + 10 }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Settings. Server ${serverLabel}`}
          className="flex-row items-center gap-3 rounded-[14px] p-2 active:bg-surface"
          onPress={onOpenSettings}
          testID="drawer-settings"
        >
          <View className="h-9 w-9 items-center justify-center rounded-full bg-primary">
            <Icon name="server-outline" size={19} tone="primaryForeground" />
          </View>
          <View className="flex-1">
            <Text className="text-[15.5px] font-medium text-text">OpenCode</Text>
            <View className="flex-row items-center gap-1.5">
              <View className={cn("h-2 w-2 rounded-full", statusTone)} />
              <Text className="flex-1 text-[13px] text-text-muted" numberOfLines={1}>
                {serverLabel}
              </Text>
            </View>
          </View>
          <Icon name="cog-outline" size={22} tone="textMuted" />
        </Pressable>
      </View>
    </View>
  );
}

const ChatRow = memo(function ChatRow({
  chat,
  active,
  canDelete,
  onSelect,
  onDeletedActive,
}: {
  chat: ChatSummary;
  active: boolean;
  canDelete: boolean;
  onSelect: (id: string) => void;
  onDeletedActive: () => void;
}) {
  // Per row, so a turn starting or ending re-renders only its own chat.
  const live = useMessagesStore((state) => state.activeTurns[chat.id] === true);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={chat.title || "Untitled"}
      accessibilityState={{ selected: active }}
      className={cn(
        "flex-row items-center gap-2 rounded-[14px] px-3 py-3",
        active ? "bg-surface" : "active:bg-surface",
      )}
      onPress={() => onSelect(chat.id)}
      onLongPress={
        canDelete ? () => confirmDeleteChat(chat, active ? onDeletedActive : undefined) : undefined
      }
      testID={`chat-row-${chat.id}`}
    >
      {live ? <View className="h-2 w-2 rounded-full bg-primary" /> : null}
      <Text
        className={cn("flex-1 text-[15.5px] text-text", active && "font-medium")}
        numberOfLines={1}
      >
        {chat.title || "Untitled"}
      </Text>
    </Pressable>
  );
});
