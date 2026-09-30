/**
 * Sidebar: every conversation the server knows about except temporary ones
 * (newest first under date headings, cached locally for instant launch) and,
 * under the list where the thumb reaches them, search, new chat and the
 * connected server, which leads to Settings and to its usage.
 *
 * Long-pressing a chat opens its menu: rename, delete, or select, which starts
 * selection mode, where chats can be deleted in bulk. Its controls take the
 * place of search and new chat, and the mode lasts while anything is selected.
 */

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { BackHandler, SectionList, View } from "react-native";
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
import { SeededKeyboardAvoidingView, useKeyboardOpen } from "@/src/ui/keyboard";
import { LinearProgress } from "@/src/ui/LinearProgress";
import { Menu, type MenuItem } from "@/src/ui/Menu";
import { RefreshControl } from "@/src/ui/RefreshControl";
import { Skeleton, SkeletonGroup } from "@/src/ui/Skeleton";
import { Spinner } from "@/src/ui/Spinner";
import { TextInput } from "@/src/ui/TextInput";
import { confirmDeleteChat, confirmDeleteSelected, promptRenameChat } from "./chatActions";
import { groupChatsByDate } from "./dateGroups";

export interface ChatDrawerProps {
  open: boolean;
  activeChatId?: string;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
  onOpenUsage: () => void;
  /** Called after the active chat is deleted, so the screen can move on. */
  onDeletedActive: () => void;
}

export function ChatDrawer({
  open,
  activeChatId,
  onSelectChat,
  onNewChat,
  onOpenSettings,
  onOpenUsage,
  onDeletedActive,
}: ChatDrawerProps) {
  const insets = useSafeAreaInsets();
  const keyboardOpen = useKeyboardOpen();
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
  // Kept after the menu closes, so it fades out with its items still in it.
  const [rowMenu, setRowMenu] = useState<{ chat: ChatSummary; y: number } | null>(null);
  const [rowMenuOpen, setRowMenuOpen] = useState(false);

  // A selection or search left behind would greet the user the next time
  // they open the sidebar.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setSelected(new Set());
      setQuery("");
    }
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

  // The layout re-reads the list at every opening, which regroups it, so
  // "Today" moves on once the day does.
  const sections = useMemo(() => groupChatsByDate(visible, new Date()), [visible]);

  const canDelete = capabilities?.deleteChat === true;
  const canRename = capabilities?.renameChat === true;
  const canShowUsage = profile !== null && capabilities?.usageReport === true;
  const toggle = useCallback(
    (id: ChatId) =>
      setSelected((current) => {
        const next = new Set(current);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
    [],
  );
  const toggleChat = useCallback((chat: ChatSummary) => toggle(chat.id), [toggle]);
  const openRowMenu = useCallback((chat: ChatSummary, y: number) => {
    setRowMenu({ chat, y });
    setRowMenuOpen(true);
  }, []);
  const heldId = rowMenuOpen ? rowMenu?.chat.id : undefined;
  const renderChat = useCallback(
    ({ item }: { item: ChatSummary }) => (
      <ChatRow
        chat={item}
        active={item.id === activeChatId}
        held={item.id === heldId}
        selection={selecting ? selected.has(item.id) : undefined}
        onPress={selecting ? toggle : onSelectChat}
        onLongPress={
          selecting
            ? canDelete
              ? toggleChat
              : undefined
            : canDelete || canRename
              ? openRowMenu
              : undefined
        }
      />
    ),
    [
      activeChatId,
      heldId,
      selecting,
      selected,
      canDelete,
      canRename,
      toggle,
      toggleChat,
      openRowMenu,
      onSelectChat,
    ],
  );

  const rowMenuItems: MenuItem[] = [];
  if (rowMenu) {
    const { chat } = rowMenu;
    if (canRename) {
      rowMenuItems.push({
        label: "Rename",
        icon: "pencil-outline",
        onPress: () => promptRenameChat(chat),
        testID: "row-menu-rename",
      });
    }
    if (canDelete) {
      rowMenuItems.push(
        {
          label: "Select",
          icon: "checkbox-multiple-marked-outline",
          onPress: () => toggle(chat.id),
          testID: "row-menu-select",
        },
        {
          label: "Delete",
          icon: "trash-can-outline",
          destructive: true,
          onPress: () =>
            confirmDeleteChat(chat, () => {
              if (chat.id === activeChatId) onDeletedActive();
            }),
          testID: "row-menu-delete",
        },
      );
    }
  }

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
    <SeededKeyboardAvoidingView
      behavior="padding"
      style={{ flex: 1, paddingTop: insets.top }}
      testID="chat-drawer"
    >
      {/* Pull-to-refresh draws its own spinner, and a first load shows skeleton rows. */}
      <View className="h-[3px] px-3">
        {chatsLoading && !refreshing && allChats.length > 0 ? (
          <LinearProgress testID="drawer-progress" />
        ) : null}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(chat) => chat.id}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        contentContainerClassName="px-2 pb-3"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} />
        }
        ListHeaderComponent={
          profile && chatsError ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Couldn't refresh chats. Retry"
              className="mx-1 mt-2 flex-row items-center gap-2.5 rounded-[14px] bg-danger/10 px-3 py-2.5"
              onPress={() => void refreshChats()}
              testID="drawer-refresh-error"
            >
              <Icon name="alert-circle-outline" size={18} tone="danger" />
              <Text className="flex-1 text-sm text-danger">Couldn’t refresh chats</Text>
              <Text className="text-sm font-medium text-primary">Retry</Text>
            </Pressable>
          ) : null
        }
        renderSectionHeader={({ section }) => (
          <Text className="px-3 pb-1.5 pt-5 text-[13.5px] font-medium text-text-muted">
            {section.title}
          </Text>
        )}
        renderItem={renderChat}
        ListEmptyComponent={
          <View className="pt-3">
            {!profile ? (
              <View className="px-3 py-2">
                <Text className="text-sm leading-5 text-text-muted">
                  Connect a server to see your chats.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  className="mt-1 self-start py-1"
                  onPress={onOpenSettings}
                  testID="drawer-open-settings"
                >
                  <Text className="text-sm font-medium text-primary">Open settings</Text>
                </Pressable>
              </View>
            ) : chatsLoading && !query ? (
              <ChatListSkeleton />
            ) : (
              <Text className="px-3 py-2 text-sm text-text-muted">
                {query ? "No matching chats" : "No chats yet"}
              </Text>
            )}
          </View>
        }
      />

      <View
        className="gap-1.5 border-t border-border px-3 pt-2.5"
        style={{ paddingBottom: keyboardOpen ? 8 : insets.bottom + 10 }}
      >
        {selecting ? (
          <View className="-mx-1 h-11 flex-row items-center gap-1" testID="drawer-selection-bar">
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
                  allVisibleSelected
                    ? "checkbox-multiple-marked"
                    : "checkbox-multiple-marked-outline"
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
          <View className="flex-row items-center gap-1">
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
                <Pressable
                  accessibilityLabel="Clear search"
                  hitSlop={8}
                  onPress={() => setQuery("")}
                >
                  <Icon name="close" size={18} tone="textMuted" />
                </Pressable>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New chat"
              className="-mr-1 h-11 w-11 items-center justify-center rounded-full active:bg-surface"
              onPress={onNewChat}
              testID="drawer-new-chat"
            >
              <Icon name="square-edit-outline" size={21} />
            </Pressable>
          </View>
        )}
        {keyboardOpen ? null : (
          <View className="flex-row items-center">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Settings. Server ${serverLabel}`}
              className="flex-1 flex-row items-center gap-3 rounded-[14px] p-2 active:bg-surface"
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
              {/* With a usage button beside it, the cog moves out to sit after that button. */}
              {canShowUsage ? null : <Icon name="cog-outline" size={22} tone="textMuted" />}
            </Pressable>
            {canShowUsage ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Usage"
                  className="h-11 w-11 items-center justify-center rounded-full active:bg-surface"
                  onPress={onOpenUsage}
                  testID="drawer-usage"
                >
                  <Icon name="chart-box-outline" size={22} tone="textMuted" />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Settings"
                  className="-mr-1 h-11 w-11 items-center justify-center rounded-full active:bg-surface"
                  onPress={onOpenSettings}
                >
                  <Icon name="cog-outline" size={22} tone="textMuted" />
                </Pressable>
              </>
            ) : null}
          </View>
        )}
      </View>

      <Menu
        visible={rowMenuOpen}
        onClose={() => setRowMenuOpen(false)}
        items={rowMenuItems}
        anchor={{ y: rowMenu?.y ?? 0, side: "left", inset: 40 }}
        testID="row-menu"
      />
    </SeededKeyboardAvoidingView>
  );
}

const ChatRow = memo(function ChatRow({
  chat,
  active,
  held,
  selection,
  onPress,
  onLongPress,
}: {
  chat: ChatSummary;
  active: boolean;
  /** Its menu is open. */
  held: boolean;
  /** Whether the row is checked; undefined outside selection mode. */
  selection: boolean | undefined;
  onPress: (id: string) => void;
  /** Gets the screen y of the press, where the row's menu opens. */
  onLongPress?: (chat: ChatSummary, y: number) => void;
}) {
  // Per row, so a turn starting or ending re-renders only its own chat.
  const live = useMessagesStore((state) => state.activeTurns[chat.id] === true);
  const deleting = useChatsStore((state) => state.deleting[chat.id] === true);
  const title = chat.title || "Untitled";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={live ? `${title}, replying` : title}
      accessibilityState={{
        ...(selection === undefined ? { selected: active } : { checked: selection }),
        busy: deleting,
        disabled: deleting,
      }}
      className={cn(
        "flex-row items-center gap-2 rounded-[14px] px-3 py-3",
        held ? "bg-surface-hover" : (selection ?? active) ? "bg-surface" : "active:bg-surface",
        deleting && "opacity-50",
      )}
      disabled={deleting}
      onPress={() => onPress(chat.id)}
      onLongPress={
        onLongPress ? (event) => onLongPress(chat, event.nativeEvent.pageY + 12) : undefined
      }
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
        {title}
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
