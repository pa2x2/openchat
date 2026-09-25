/**
 * Chats store — the list of chats for the connected provider.
 *
 * Persisted to MMKV so the list renders instantly on launch and survives
 * restarts; `refresh()` reconciles against the server. The store holds
 * only domain types; all backend work goes through `ChatProvider`. A
 * future second backend gets its own store instance keyed by provider id
 * (the v1 app has exactly one connection).
 */

import type { ChatId, ChatSummary } from "@/src/domain";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { getProvider } from "@/src/lib/providerFactory";
import { mmkvStorage } from "./storage";

interface ChatsStoreState {
  chats: ChatSummary[];
  /** True while a server refresh is in flight. */
  loading: boolean;
  /** Last refresh failure, as a user-facing message. */
  error: string | null;
  /**
   * Chats whose last rerun was staged on the server but never delivered, as
   * the backend message id it was staged at. Persisted on purpose: if the app
   * dies between the two halves of a rerun, the next message the user sends
   * would otherwise discard older turns. The chat screen drops the staged
   * rerun when it opens.
   */
  pendingRegenerate: Record<ChatId, string>;
  /** Insert or update one chat (e.g. after createChat or a title change). */
  upsert: (chat: ChatSummary) => void;
  /** Moves a chat to the top of the list with a fresh timestamp. */
  touch: (id: ChatId, updatedAt?: number) => void;
  remove: (id: ChatId) => void;
  markPendingRegenerate: (id: ChatId, messageId: string) => void;
  clearPendingRegenerate: (id: ChatId) => void;
  /** Re-reads the chat list from the server. Safe to call concurrently. */
  refresh: () => Promise<void>;
  clear: () => void;
}

function sortChats(chats: ChatSummary[]): ChatSummary[] {
  return [...chats].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function createChatsStore(storage = mmkvStorage) {
  return create<ChatsStoreState>()(
    persist(
      (set, get) => ({
        chats: [],
        loading: false,
        error: null,
        pendingRegenerate: {},
        upsert: (chat) =>
          set((state) => ({
            chats: sortChats([...state.chats.filter((existing) => existing.id !== chat.id), chat]),
          })),
        touch: (id, updatedAt = Date.now()) =>
          set((state) => ({
            chats: sortChats(
              state.chats.map((chat) => (chat.id === id ? { ...chat, updatedAt } : chat)),
            ),
          })),
        remove: (id) => set((state) => ({ chats: state.chats.filter((chat) => chat.id !== id) })),
        markPendingRegenerate: (id, messageId) =>
          set((state) => ({ pendingRegenerate: { ...state.pendingRegenerate, [id]: messageId } })),
        clearPendingRegenerate: (id) =>
          set((state) => {
            if (!state.pendingRegenerate[id]) return state;
            const pendingRegenerate = { ...state.pendingRegenerate };
            delete pendingRegenerate[id];
            return { pendingRegenerate };
          }),
        refresh: async () => {
          if (get().loading) return;
          set({ loading: true, error: null });
          try {
            const provider = await getProvider();
            if (!provider) {
              set({ loading: false, error: "Not connected." });
              return;
            }
            const chats = await provider.listChats();
            set({ chats: sortChats(chats), loading: false });
          } catch (error) {
            set({
              loading: false,
              error:
                error instanceof Error && error.message ? error.message : "Could not load chats.",
            });
          }
        },
        clear: () => set({ chats: [], loading: false, error: null, pendingRegenerate: {} }),
      }),
      {
        name: "chats",
        storage: createJSONStorage(() => storage),
        // The durable list and the staged-rerun markers persist; loading/error
        // are live state.
        partialize: (state) => ({
          chats: state.chats,
          pendingRegenerate: state.pendingRegenerate,
        }),
      },
    ),
  );
}

export const useChatsStore = createChatsStore();
