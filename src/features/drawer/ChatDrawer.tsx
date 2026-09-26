/**
 * Sidebar: search, new chat, every conversation the server knows about
 * except temporary ones (newest first, cached locally for instant launch),
 * and the connected server at the bottom, which leads to Settings.
 *
 * Long-pressing a chat starts selection mode, where chats can be deleted in
 * bulk. The mode lasts while anything is selected.
 */

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { BackHandler, FlatList, RefreshControl, Text, TextInput, View } from "react-native";
import { Pressable } from "@/src/ui/Pressable";
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
  open: boolean;
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
      {
        label: "Delete",
        style: "destructive",
        onPress: () => void deleteChats([chat.id], () => onDeleted?.()),
      },
    ],
  });
}

/**
 * Deletes on the server, then locally. A chat the server still has stays in
 * the list, since the next refresh would bring it back anyway. `onDeleted`
 * gets the chats that are gone, even when some others failed.
 */
export async function deleteChats(
  ids: ChatId[],
  onDeleted?: (deleted: ChatId[]) => void,
): Promise<void> {
  const provider = await getProvider().catch(() => null);
  if (!provider) {
    showDialog({
      title: ids.length === 1 ? "Could not delete chat" : "Could not delete chats",
      message: "Not connected. Open Settings to connect to a server.",
    });
    return;
  }
  const results = await Promise.allSettled(ids.map((id) => provider.deleteChat(id)));
  const deleted = ids.filter((_, index) => results[index].status === "fulfilled");
  if (deleted.length > 0) {
    useChatsStore.getState().remove(deleted);
    const messages = useMessagesStore.getState();
    for (const id of deleted) messages.removeChat(id);
    onDeleted?.(deleted);
  }
  const failure = results.find((result) => result.status === "rejected");
  if (failure) {
    const reason: unknown = failure.reason;
    const failed = ids.length - deleted.length;
    showDialog({
      title:
        ids.length === 1
          ? "Could not delete chat"
          : `Could not delete ${failed} of ${ids.length} chats`,
      message: reason instanceof Error && reason.message ? reason.message : "Try again later.",
    });
  }
}

function confirmDeleteSelected(ids: ChatId[], onDeleted: (deleted: ChatId[]) => void) {
  showDialog({
    title: ids.length === 1 ? "Delete chat?" : `Delete ${ids.length} chats?`,
    message: "This can't be undone.",
    actions: [
      { label: "Cancel", style: "cancel" },
      {
        label: "Delete",
        style: "destructive",
        onPress: () => void deleteChats(ids, onDeleted),
      },
    ],
  });
}

export function ChatDrawer({
  open,
  activeChatId,
  onSelectChat,
  onNewChat,
  onOpenSettings,
  onDeletedActive,
}: ChatDrawerProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const allChats = useChatsStore((state) => state.chats);
  const temporary = useChatsStore((state) => state.temporary);
  const refreshChats = useChatsStore((state) => state.refresh);
  const capabilities = useProviderCapabilities();
  const profile = useConnectionStore((state) => state.profile);
  const chatsError = useChatsStore((state) => state.error);
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<ChatId>>(new Set());
  const selecting = selected.size > 0;

  // A selection left behind would greet the user the next time they open
  // the sidebar.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setSelected(new Set());
  }

  // Registered after the layout's close-on-back, so it runs first.
  useEffect(() => {
    if (!selecting) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setSelected(new Set());
      return true;
    });
    return () => subscription.remove();
  }, [selecting]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allChats.filter(
      (chat) =>
        !temporary[chat.id] &&
        (!needle || (chat.title || "Untitled").toLowerCase().includes(needle)),
    );
  }, [allChats, temporary, query]);

  const canDelete = capabilities?.deleteChat === true;
  const toggle = useCallback(
    (id: ChatId) =>
      setSelected((current) => {
        const next = new Set(current);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
    [],
  );
  const renderChat = useCallback(
    ({ item }: { item: ChatSummary }) => (
      <ChatRow
        chat={item}
        active={item.id === activeChatId}
        selection={selecting ? selected.has(item.id) : undefined}
        onPress={selecting ? toggle : onSelectChat}
        onLongPress={canDelete ? toggle : undefined}
      />
    ),
    [activeChatId, selecting, selected, canDelete, toggle, onSelectChat],
  );

  // Only chats still listed: one deleted elsewhere may linger in the set.
  const selectedIds = allChats.filter((chat) => selected.has(chat.id)).map((chat) => chat.id);
  const allVisibleSelected = visible.length > 0 && visible.every((chat) => selected.has(chat.id));

  function toggleAllVisible() {
    setSelected((current) => {
      const next = new Set(current);
      for (const chat of visible) {
        if (allVisibleSelected) next.delete(chat.id);
        else next.add(chat.id);
      }
      return next;
    });
  }

  function deleteSelected() {
    confirmDeleteSelected(selectedIds, (deleted) => {
      setSelected((current) => {
        const next = new Set(current);
        for (const id of deleted) next.delete(id);
        return next;
      });
      if (activeChatId && deleted.includes(activeChatId)) onDeletedActive();
    });
  }

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
      {selecting ? (
        <View
          className="mb-2 h-11 flex-row items-center gap-1 px-1.5"
          testID="drawer-selection-bar"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel selection"
            className="h-11 w-11 items-center justify-center rounded-full active:bg-surface"
            onPress={() => setSelected(new Set())}
          >
            <Icon name="close" size={22} />
          </Pressable>
          <Text
            className="flex-1 text-[17px] font-medium text-text"
            accessibilityLiveRegion="polite"
          >
            {selectedIds.length} selected
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={allVisibleSelected ? "Deselect all" : "Select all"}
            className="h-11 w-11 items-center justify-center rounded-full active:bg-surface"
            onPress={toggleAllVisible}
            testID="drawer-select-all"
          >
            <Icon
              name={
                allVisibleSelected ? "checkbox-multiple-marked" : "checkbox-multiple-marked-outline"
              }
              size={22}
              tone={allVisibleSelected ? "primary" : "text"}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Delete ${selectedIds.length} selected`}
            accessibilityState={{ disabled: selectedIds.length === 0 }}
            disabled={selectedIds.length === 0}
            className="h-11 w-11 items-center justify-center rounded-full active:bg-surface"
            onPress={deleteSelected}
            testID="drawer-delete-selected"
          >
            <Icon name="trash-can-outline" size={22} tone="danger" />
          </Pressable>
        </View>
      ) : (
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
      )}

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
  selection,
  onPress,
  onLongPress,
}: {
  chat: ChatSummary;
  active: boolean;
  /** Whether the row is checked; undefined outside selection mode. */
  selection: boolean | undefined;
  onPress: (id: string) => void;
  onLongPress?: (id: string) => void;
}) {
  // Per row, so a turn starting or ending re-renders only its own chat.
  const live = useMessagesStore((state) => state.activeTurns[chat.id] === true);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={chat.title || "Untitled"}
      accessibilityState={selection === undefined ? { selected: active } : { checked: selection }}
      className={cn(
        "flex-row items-center gap-2 rounded-[14px] px-3 py-3",
        (selection ?? active) ? "bg-surface" : "active:bg-surface",
      )}
      onPress={() => onPress(chat.id)}
      onLongPress={onLongPress ? () => onLongPress(chat.id) : undefined}
      testID={`chat-row-${chat.id}`}
    >
      {selection !== undefined ? (
        <Icon
          name={selection ? "checkbox-marked-circle" : "checkbox-blank-circle-outline"}
          size={21}
          tone={selection ? "primary" : "textMuted"}
        />
      ) : null}
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
