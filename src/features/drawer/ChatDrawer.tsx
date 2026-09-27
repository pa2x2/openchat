/**
 * Sidebar: search, new chat, every conversation the server knows about
 * except temporary ones (newest first, cached locally for instant launch),
 * and the connected server at the bottom, which leads to Settings.
 *
 * Long-pressing a chat starts selection mode, where chats can be deleted in
 * bulk. The mode lasts while anything is selected.
 */

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { BackHandler, FlatList, View } from "react-native";
import { Text } from "@/src/ui/Text";
import { Pressable } from "@/src/ui/Pressable";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ChatId, ChatSummary } from "@/src/domain";
import { cn } from "@/src/lib/cn";
import { useProviderCapabilities, useProviderDescriptor } from "@/src/lib/providerFactory";
import { useChatsStore } from "@/src/stores/chats";
import { useConnectionStore } from "@/src/stores/connection";
import { useMessagesStore } from "@/src/stores/messages";
import { Icon } from "@/src/ui/Icon";
import { LinearProgress } from "@/src/ui/LinearProgress";
import { RefreshControl } from "@/src/ui/RefreshControl";
import { Skeleton, SkeletonGroup } from "@/src/ui/Skeleton";
import { Spinner } from "@/src/ui/Spinner";
import { TextInput } from "@/src/ui/TextInput";
import { confirmDeleteSelected } from "./chatActions";

export interface ChatDrawerProps {
  open: boolean;
  activeChatId?: string;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
  /** Called after the active chat is deleted, so the screen can move on. */
  onDeletedActive: () => void;
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
  const allChats = useChatsStore((state) => state.chats);
  const temporary = useChatsStore((state) => state.temporary);
  const refreshChats = useChatsStore((state) => state.refresh);
  const capabilities = useProviderCapabilities();
  const providerLabel = useProviderDescriptor()?.label ?? "Server";
  const profile = useConnectionStore((state) => state.profile);
  const chatsError = useChatsStore((state) => state.error);
  const chatsLoading = useChatsStore((state) => state.loading);
  const deleting = useChatsStore((state) => state.deleting);
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
  const deletingSelected = selectedIds.some((id) => deleting[id]);
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
            accessibilityState={{
              disabled: selectedIds.length === 0 || deletingSelected,
              busy: deletingSelected,
            }}
            disabled={selectedIds.length === 0 || deletingSelected}
            className="h-11 w-11 items-center justify-center rounded-full active:bg-surface"
            onPress={deleteSelected}
            testID="drawer-delete-selected"
          >
            {deletingSelected ? (
              <Spinner size="small" tone="danger" />
            ) : (
              <Icon name="trash-can-outline" size={22} tone="danger" />
            )}
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

      {/* Pull-to-refresh draws its own spinner, and a first load shows skeleton rows. */}
      <View className="h-[3px] px-3">
        {chatsLoading && !refreshing && allChats.length > 0 ? (
          <LinearProgress testID="drawer-progress" />
        ) : null}
      </View>

      <FlatList
        data={visible}
        keyExtractor={(chat) => chat.id}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="px-2 pb-3"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} />
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
          chatsLoading && !query ? (
            <ChatListSkeleton />
          ) : (
            <Text className="px-3 py-2 text-sm text-text-muted">
              {query ? "No matching chats" : "No chats yet"}
            </Text>
          )
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
            <Text className="text-[15.5px] font-medium text-text">{providerLabel}</Text>
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
  const deleting = useChatsStore((state) => state.deleting[chat.id] === true);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={chat.title || "Untitled"}
      accessibilityState={{
        ...(selection === undefined ? { selected: active } : { checked: selection }),
        busy: deleting,
        disabled: deleting,
      }}
      className={cn(
        "flex-row items-center gap-2 rounded-[14px] px-3 py-3",
        (selection ?? active) ? "bg-surface" : "active:bg-surface",
        deleting && "opacity-50",
      )}
      disabled={deleting}
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
      {deleting ? <Spinner size="small" /> : null}
    </Pressable>
  );
});

const SKELETON_TITLE_WIDTHS = ["w-[72%]", "w-[54%]", "w-[80%]", "w-[46%]", "w-[64%]", "w-[58%]"];

function ChatListSkeleton() {
  return (
    <SkeletonGroup label="Loading chats" testID="drawer-skeleton">
      {SKELETON_TITLE_WIDTHS.map((width) => (
        <View key={width} className="px-3 py-[15px]">
          <Skeleton className={cn("h-3.5", width)} />
        </View>
      ))}
    </SkeletonGroup>
  );
}
