/**
 * Drafts store — what is typed in each chat's composer and not yet sent,
 * and the quotes waiting to go with it.
 *
 * The chat screen remounts per chat, so the composer's own state would be
 * lost on every switch; it reads its draft from here on mount and writes
 * back as the user types. Persisted so a killed app keeps it too. Keyed by
 * chat id, with the new-chat screen under its route id.
 */

import type { ChatId, Quote } from "@/src/domain";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createThrottledJSONStorage, mmkvStorage } from "./storage";

const PERSIST_INTERVAL_MS = 1_000;

export const NO_QUOTES: Quote[] = [];

interface DraftsStoreState {
  byChat: Record<ChatId, string>;
  quotesByChat: Record<ChatId, Quote[]>;
  /** An empty `text` drops the draft. */
  setDraft: (chatId: ChatId, text: string) => void;
  setQuotes: (chatId: ChatId, quotes: Quote[]) => void;
  remove: (chatIds: ChatId[]) => void;
  clear: () => void;
}

/** `persistIntervalMs` of 0 writes every change immediately. */
export function createDraftsStore(storage = mmkvStorage, persistIntervalMs = PERSIST_INTERVAL_MS) {
  return create<DraftsStoreState>()(
    persist(
      (set, get) => ({
        byChat: {},
        quotesByChat: {},
        setDraft: (chatId, text) => {
          // Persist writes on every set, even one that changes nothing.
          if ((get().byChat[chatId] ?? "") === text) return;
          set((state) => {
            const byChat = { ...state.byChat };
            if (text) byChat[chatId] = text;
            else delete byChat[chatId];
            return { byChat };
          });
        },
        setQuotes: (chatId, quotes) => {
          if (quotes === (get().quotesByChat[chatId] ?? NO_QUOTES)) return;
          set((state) => {
            const quotesByChat = { ...state.quotesByChat };
            if (quotes.length > 0) quotesByChat[chatId] = quotes;
            else delete quotesByChat[chatId];
            return { quotesByChat };
          });
        },
        remove: (chatIds) => {
          const { byChat: texts, quotesByChat: quoted } = get();
          if (!chatIds.some((chatId) => chatId in texts || chatId in quoted)) return;
          set((state) => {
            const byChat = { ...state.byChat };
            const quotesByChat = { ...state.quotesByChat };
            for (const chatId of chatIds) {
              delete byChat[chatId];
              delete quotesByChat[chatId];
            }
            return { byChat, quotesByChat };
          });
        },
        clear: () => set({ byChat: {}, quotesByChat: {} }),
      }),
      {
        name: "drafts",
        storage:
          persistIntervalMs > 0
            ? createThrottledJSONStorage(() => storage, persistIntervalMs)
            : createJSONStorage(() => storage),
        partialize: (state) => ({ byChat: state.byChat, quotesByChat: state.quotesByChat }),
      },
    ),
  );
}

export const useDraftsStore = createDraftsStore();
