/**
 * Settings store — app-owned preferences, persisted to MMKV.
 *
 * Holds the default model per provider, used when a chat has no explicit
 * model (new chats and chats the server reports without one), the
 * appearance and colour preferences, and the update channel.
 */

import Constants from "expo-constants";
import type { ModelRef, ProviderId } from "@/src/domain";
import { isPrerelease } from "@/src/features/updates/version";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { mmkvStorage } from "./storage";

/** Colour scheme preference; "system" follows the device setting. */
export type Appearance = "system" | "light" | "dark";

/** Where the palette comes from; "dynamic" is Material You (Android 12+). */
export type ColorSource = "default" | "dynamic";

/** Which releases the in-app updater offers; "prerelease" also gets stable ones. */
export type UpdateChannel = "stable" | "prerelease";

/** A pre-release build starts on the pre-release channel, so it keeps getting updates. */
export function defaultUpdateChannel(appVersion: string): UpdateChannel {
  return isPrerelease(appVersion) ? "prerelease" : "stable";
}

interface SettingsStoreState {
  defaultModels: Record<ProviderId, ModelRef>;
  setDefaultModel: (providerId: ProviderId, model: ModelRef) => void;
  clearDefaultModel: (providerId: ProviderId) => void;
  appearance: Appearance;
  setAppearance: (appearance: Appearance) => void;
  colorSource: ColorSource;
  setColorSource: (colorSource: ColorSource) => void;
  updateChannel: UpdateChannel;
  setUpdateChannel: (channel: UpdateChannel) => void;
}

export function createSettingsStore(
  storage = mmkvStorage,
  appVersion = Constants.expoConfig?.version ?? "",
) {
  return create<SettingsStoreState>()(
    persist(
      (set) => ({
        defaultModels: {},
        appearance: "system",
        setAppearance: (appearance) => set({ appearance }),
        colorSource: "default",
        setColorSource: (colorSource) => set({ colorSource }),
        updateChannel: defaultUpdateChannel(appVersion),
        setUpdateChannel: (updateChannel) => set({ updateChannel }),
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
