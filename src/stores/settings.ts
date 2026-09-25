/**
 * Settings store — app-owned preferences, persisted to MMKV.
 *
 * Holds the default model per provider, used when a chat has no explicit
 * model (new chats and chats the server reports without one), and the
 * appearance preference.
 */

import type { ModelRef, ProviderId } from "@/src/domain";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { mmkvStorage } from "./storage";

/** Colour scheme preference; "system" follows the device setting. */
export type Appearance = "system" | "light" | "dark";

interface SettingsStoreState {
  /** Default model keyed by provider id. */
  defaultModels: Record<ProviderId, ModelRef>;
  setDefaultModel: (providerId: ProviderId, model: ModelRef) => void;
  clearDefaultModel: (providerId: ProviderId) => void;
  appearance: Appearance;
  setAppearance: (appearance: Appearance) => void;
}

export function createSettingsStore(storage = mmkvStorage) {
  return create<SettingsStoreState>()(
    persist(
      (set) => ({
        defaultModels: {},
        appearance: "system",
        setAppearance: (appearance) => set({ appearance }),
        setDefaultModel: (providerId, model) =>
          set((state) => ({
            defaultModels: { ...state.defaultModels, [providerId]: model },
          })),
        clearDefaultModel: (providerId) =>
          set((state) => {
            const defaultModels = { ...state.defaultModels };
            delete defaultModels[providerId];
            return { defaultModels };
          }),
      }),
      {
        name: "settings",
        storage: createJSONStorage(() => storage),
      },
    ),
  );
}

export const useSettingsStore = createSettingsStore();
