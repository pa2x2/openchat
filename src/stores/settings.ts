/**
 * Settings store — app-owned preferences, persisted to MMKV.
 *
 * Holds the last model picked per provider, used when a chat has no explicit
 * model (new chats and chats the server reports without one), the
 * appearance and colour preferences, haptics, the update channel, and whether
 * the notification permission was already asked for.
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
  lastModels: Record<ProviderId, ModelRef>;
  setLastModel: (providerId: ProviderId, model: ModelRef) => void;
  appearance: Appearance;
  setAppearance: (appearance: Appearance) => void;
  colorSource: ColorSource;
  setColorSource: (colorSource: ColorSource) => void;
  haptics: boolean;
  setHaptics: (haptics: boolean) => void;
  updateChannel: UpdateChannel;
  setUpdateChannel: (channel: UpdateChannel) => void;
  notificationsAsked: boolean;
  markNotificationsAsked: () => void;
}

export function createSettingsStore(
  storage = mmkvStorage,
  appVersion = Constants.expoConfig?.version ?? "",
) {
  return create<SettingsStoreState>()(
    persist(
      (set) => ({
        lastModels: {},
        appearance: "system",
        setAppearance: (appearance) => set({ appearance }),
        colorSource: "default",
        setColorSource: (colorSource) => set({ colorSource }),
        haptics: true,
        setHaptics: (haptics) => set({ haptics }),
        updateChannel: defaultUpdateChannel(appVersion),
        setUpdateChannel: (updateChannel) => set({ updateChannel }),
        notificationsAsked: false,
        markNotificationsAsked: () => set({ notificationsAsked: true }),
        setLastModel: (providerId, model) =>
          set((state) => ({
            lastModels: { ...state.lastModels, [providerId]: model },
          })),
      }),
      {
        name: "settings",
        storage: createJSONStorage(() => storage),
        version: 1,
        // v0 kept a default model picked in Settings; it seeds the last-used one.
        migrate: (persisted, version) => {
          const state = persisted as Record<string, unknown>;
          if (version === 0) {
            const { defaultModels, ...rest } = state;
            return { ...rest, lastModels: defaultModels ?? {} } as SettingsStoreState;
          }
          return state as unknown as SettingsStoreState;
        },
      },
    ),
  );
}

export const useSettingsStore = createSettingsStore();
