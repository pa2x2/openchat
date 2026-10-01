/**
 * Drafts store — what is typed in each chat's composer and not yet sent.
 *
 * The chat screen remounts per chat, so the composer's own state would be
 * lost on every switch; it reads its draft from here on mount and writes
 * back as the user types. Persisted so a killed app keeps it too. Keyed by
 * chat id, with the new-chat screen under its route id.
 */

import type { ChatId } from "@/src/domain";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createThrottledJSONStorage, mmkvStorage } from "./storage";

const PERSIST_INTERVAL_MS = 1_000;

interface DraftsStoreState {
  byChat: Record<ChatId, string>;
  /** An empty `text` drops the draft. */
  setDraft: (chatId: ChatId, text: string) => void;
  remove: (chatIds: ChatId[]) => void;
  clear: () => void;
}

/** `persistIntervalMs` of 0 writes every change immediately. */
export function createDraftsStore(storage = mmkvStorage, persistIntervalMs = PERSIST_INTERVAL_MS) {
  return create<DraftsStoreState>()(
    persist(
      (set, get) => ({
        byChat: {},
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
        remove: (chatIds) => {
          if (!chatIds.some((chatId) => chatId in get().byChat)) return;
          set((state) => {
            const byChat = { ...state.byChat };
            for (const chatId of chatIds) delete byChat[chatId];
            return { byChat };
          });
        },
        clear: () => set({ byChat: {} }),
      }),
      {
        name: "drafts",
        storage:
          persistIntervalMs > 0
            ? createThrottledJSONStorage(() => storage, persistIntervalMs)
            : createJSONStorage(() => storage),
        partialize: (state) => ({ byChat: state.byChat }),
      },
    ),
  );
}

export const useDraftsStore = createDraftsStore();
