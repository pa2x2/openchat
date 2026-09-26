/**
 * Temporary chats are ordinary server sessions that the app hides from the
 * sidebar and deletes when the user leaves them. If the delete cannot happen
 * then (offline, app killed), the chat stays marked, and so hidden, until
 * `purgeTemporaryChats` succeeds on a later launch.
 */

import type { ChatId } from "@/src/domain";
import { getProvider } from "@/src/lib/providerFactory";
import { useChatsStore } from "@/src/stores/chats";
import { useMessagesStore } from "@/src/stores/messages";
import { interruptTurn } from "@/src/stream/streamMachine";

export async function discardTemporaryChat(id: ChatId): Promise<void> {
  // A reply still streaming would otherwise keep writing into a chat that is gone.
  await interruptTurn(id);
  useMessagesStore.getState().removeChat(id);
  try {
    const provider = await getProvider();
    if (!provider) return;
    await provider.deleteChat(id);
  } catch {
    return;
  }
  useChatsStore.getState().forgetTemporary(id);
}

/**
 * Deletes temporary chats left over from an earlier run. Call it at launch,
 * before any chat can be opened: it discards every chat marked at the time.
 */
export async function purgeTemporaryChats(): Promise<void> {
  const leftovers = Object.keys(useChatsStore.getState().temporary);
  await Promise.all(leftovers.map(discardTemporaryChat));
}
