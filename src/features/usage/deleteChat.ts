import type { ChatId } from "@/src/domain";
import type { ChatProvider } from "@/src/providers/types";
import { useConnectionStore } from "@/src/stores/connection";
import { useUsageStore } from "@/src/stores/usage";

/**
 * Deletes a chat on the server and keeps what it had used, which the server's
 * usage report forgets with the chat. The transcript is read from the server
 * first, since the cached one is missing for a chat never opened here and
 * there is nothing left to read afterwards. It is kept only once the delete
 * went through: until then the server still counts the chat itself.
 */
export async function deleteChatKeepingUsage(provider: ChatProvider, id: ChatId): Promise<void> {
  const server = useConnectionStore.getState().profile?.baseUrl;
  const transcript =
    server && provider.usageReport ? await provider.fetchMessages(id).catch(() => null) : null;
  await provider.deleteChat(id);
  if (server && transcript) useUsageStore.getState().keepDeleted(server, id, transcript);
}
