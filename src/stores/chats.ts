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
import { t } from "@/src/i18n";

interface ChatsStoreState {
  chats: ChatSummary[];
  loading: boolean;
  error: string | null;
  /**
   * Chats whose last rerun was staged on the server but never delivered, as
   * the backend message id it was staged at. Persisted on purpose: if the app
   * dies between the two halves of a rerun, the next message the user sends
   * would otherwise discard older turns. The chat screen drops the staged
   * rerun when it opens.
   */
  pendingRegenerate: Record<ChatId, string>;
  /**
   * Temporary chats: real chats on the server, kept out of the sidebar and
   * deleted once the user leaves them. Persisted so a chat left behind by a
   * killed app stays hidden and is deleted on the next launch.
   */
  temporary: Record<ChatId, true>;
  /** Not persisted: a delete in flight does not survive a restart. */
  deleting: Record<ChatId, true>;
  upsert: (chat: ChatSummary) => void;
  /** Moves a chat to the top of the list with a fresh timestamp. */
  touch: (id: ChatId, updatedAt?: number) => void;
  setUsage: (id: ChatId, totals: Pick<ChatSummary, "usage" | "cost">) => void;
  remove: (ids: ChatId[]) => void;
  markPendingRegenerate: (id: ChatId, messageId: string) => void;
  clearPendingRegenerate: (id: ChatId) => void;
  markTemporary: (id: ChatId) => void;
  /** Also drops the chat from the list. */
  forgetTemporary: (id: ChatId) => void;
  /** Turns a temporary chat into a normal one, so leaving it no longer deletes it. */
  keepTemporary: (id: ChatId) => void;
  setDeleting: (ids: ChatId[], deleting: boolean) => void;
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
        temporary: {},
        deleting: {},
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
        setUsage: (id, { usage, cost }) =>
          set((state) => ({
            chats: state.chats.map((chat) => (chat.id === id ? { ...chat, usage, cost } : chat)),
          })),
        remove: (ids) =>
          set((state) => ({ chats: state.chats.filter((chat) => !ids.includes(chat.id)) })),
        markPendingRegenerate: (id, messageId) =>
          set((state) => ({ pendingRegenerate: { ...state.pendingRegenerate, [id]: messageId } })),
        clearPendingRegenerate: (id) =>
          set((state) => {
            if (!state.pendingRegenerate[id]) return state;
            const pendingRegenerate = { ...state.pendingRegenerate };
            delete pendingRegenerate[id];
            return { pendingRegenerate };
          }),
        markTemporary: (id) => set((state) => ({ temporary: { ...state.temporary, [id]: true } })),
        forgetTemporary: (id) =>
          set((state) => {
            const temporary = { ...state.temporary };
            delete temporary[id];
            return { temporary, chats: state.chats.filter((chat) => chat.id !== id) };
          }),
        keepTemporary: (id) =>
          set((state) => {
            const temporary = { ...state.temporary };
            delete temporary[id];
            return { temporary };
          }),
        setDeleting: (ids, deleting) =>
          set((state) => {
            const next = { ...state.deleting };
            for (const id of ids) {
              if (deleting) next[id] = true;
              else delete next[id];
            }
            return { deleting: next };
          }),
        refresh: async () => {
          if (get().loading) return;
          set({ loading: true, error: null });
          try {
            const provider = await getProvider();
            if (!provider) {
              set({ loading: false, error: t("errors.notConnectedShort") });
              return;
            }
            const chats = await provider.listChats();
            set({ chats: sortChats(chats), loading: false });
          } catch (error) {
            set({
              loading: false,
              error:
                error instanceof Error && error.message ? error.message : t("drawer.loadFailed"),
            });
          }
        },
        clear: () =>
          set({
            chats: [],
            loading: false,
            error: null,
            pendingRegenerate: {},
            temporary: {},
            deleting: {},
          }),
      }),
      {
        name: "chats",
        storage: createJSONStorage(() => storage),
        partialize: (state) => ({
          chats: state.chats,
          pendingRegenerate: state.pendingRegenerate,
          temporary: state.temporary,
        }),
      },
    ),
  );
}

export const useChatsStore = createChatsStore();
