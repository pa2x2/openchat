/**
 * Chat actions offered from both the sidebar and the chat's own menu. Each
 * asks first where the action needs it, then updates the server and the
 * local list, and reports a failure in a dialog.
 */

import { UNTITLED_CHAT, type ChatId, type ChatSummary } from "@/src/domain";
import { deleteChatKeepingUsage } from "@/src/features/usage/deleteChat";
import { t } from "@/src/i18n";
import { chatTitle } from "@/src/lib/chatTitle";
import { getProvider } from "@/src/lib/providerFactory";
import { useChatsStore } from "@/src/stores/chats";
import { useMessagesStore } from "@/src/stores/messages";
import { showDialog } from "@/src/ui/Dialog";

/** Removes a chat on the server and locally, after asking. */
export function confirmDeleteChat(chat: Pick<ChatSummary, "id" | "title">, onDeleted?: () => void) {
  showDialog({
    title: t("drawer.delete.title"),
    message: t("drawer.delete.message", { title: chatTitle(t, chat.title) }),
    actions: [
      { label: t("common.cancel"), style: "cancel" },
      {
        label: t("common.delete"),
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
      title: ids.length === 1 ? t("drawer.delete.failed") : t("drawer.delete.failedMany"),
      message: t("errors.notConnected"),
    });
    return;
  }
  const chats = useChatsStore.getState();
  chats.setDeleting(ids, true);
  const results = await Promise.allSettled(ids.map((id) => deleteChatKeepingUsage(provider, id)));
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
          ? t("drawer.delete.failed")
          : t("drawer.delete.failedSome", { failed, count: ids.length }),
      message: reason instanceof Error && reason.message ? reason.message : t("errors.tryLater"),
    });
  }
}

export function confirmDeleteSelected(ids: ChatId[], onDeleted: (deleted: ChatId[]) => void) {
  showDialog({
    title:
      ids.length === 1
        ? t("drawer.delete.title")
        : t("drawer.delete.titleMany", { count: ids.length }),
    message: t("drawer.delete.irreversible"),
    actions: [
      { label: t("common.cancel"), style: "cancel" },
      {
        label: t("common.delete"),
        style: "destructive",
        onPress: () => void deleteChats(ids, onDeleted),
      },
    ],
  });
}

export function promptRenameChat(chat: Pick<ChatSummary, "id" | "title">) {
  showDialog({
    title: t("drawer.rename.title"),
    input: {
      value: chat.title === UNTITLED_CHAT ? "" : chat.title,
      placeholder: t("drawer.rename.name"),
      label: t("drawer.rename.name"),
    },
    actions: [
      { label: t("common.cancel"), style: "cancel" },
      { label: t("common.save"), onPress: (title) => void renameChat(chat.id, title) },
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
      title: t("drawer.rename.failed"),
      message: t("errors.notConnected"),
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
      title: t("drawer.rename.failed"),
      message: error instanceof Error && error.message ? error.message : t("errors.tryLater"),
    });
  }
}
