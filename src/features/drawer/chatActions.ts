/**
 * Chat actions offered from both the sidebar and the chat's own menu. Each
 * asks first where the action needs it, then updates the server and the
 * local list, and reports a failure in a dialog.
 */

import { UNTITLED_CHAT, type ChatId, type ChatSummary } from "@/src/domain";
import { getProvider } from "@/src/lib/providerFactory";
import { useChatsStore } from "@/src/stores/chats";
import { useMessagesStore } from "@/src/stores/messages";
import { showDialog } from "@/src/ui/Dialog";

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
  const chats = useChatsStore.getState();
  chats.setDeleting(ids, true);
  const results = await Promise.allSettled(ids.map((id) => provider.deleteChat(id)));
  chats.setDeleting(ids, false);
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

export function confirmDeleteSelected(ids: ChatId[], onDeleted: (deleted: ChatId[]) => void) {
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

export function promptRenameChat(chat: Pick<ChatSummary, "id" | "title">) {
  showDialog({
    title: "Rename chat",
    input: {
      value: chat.title === UNTITLED_CHAT ? "" : chat.title,
      placeholder: "Chat name",
      label: "Chat name",
    },
    actions: [
      { label: "Cancel", style: "cancel" },
      { label: "Save", onPress: (title) => void renameChat(chat.id, title) },
    ],
  });
}

async function renameChat(id: ChatId, title: string): Promise<void> {
  const trimmed = title.trim();
  const before = useChatsStore.getState().chats.find((chat) => chat.id === id);
  if (!trimmed || !before || trimmed === before.title) return;
  const provider = await getProvider().catch(() => null);
  if (!provider?.renameChat) {
    showDialog({
      title: "Could not rename chat",
      message: "Not connected. Open Settings to connect to a server.",
    });
    return;
  }
  // Shown at once; a failure puts the old title back unless it changed again meanwhile.
  useChatsStore.getState().upsert({ ...before, title: trimmed });
  try {
    await provider.renameChat(id, trimmed);
  } catch (error) {
    const latest = useChatsStore.getState().chats.find((chat) => chat.id === id);
    if (latest?.title === trimmed)
      useChatsStore.getState().upsert({ ...latest, title: before.title });
    showDialog({
      title: "Could not rename chat",
      message: error instanceof Error && error.message ? error.message : "Try again later.",
    });
  }
}
