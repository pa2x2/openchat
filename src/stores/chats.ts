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
  /** Insert or update one chat (e.g. after createChat or a title change). */
  upsert: (chat: ChatSummary) => void;
  /** Moves a chat to the top of the list with a fresh timestamp. */
  touch: (id: ChatId, updatedAt?: number) => void;
  remove: (id: ChatId) => void;
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
        clear: () => set({ chats: [], loading: false, error: null }),
      }),
      {
        name: "chats",
        storage: createJSONStorage(() => storage),
        // Only the durable list persists; loading/error are live state.
        partialize: (state) => ({ chats: state.chats }),
      },
    ),
  );
}

export const useChatsStore = createChatsStore();
