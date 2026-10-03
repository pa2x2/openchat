/**
 * Connection store — the persisted connection profile and live connection
 * status for the (single) configured server.
 *
 * The URL and provider id persist in MMKV.
 */

import type { ProviderId } from "@/src/domain";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { mmkvStorage } from "./storage";

export type ConnectionState = "disconnected" | "connecting" | "connected";

export interface ConnectionProfile {
  providerId: ProviderId;
  baseUrl: string;
  serverVersion?: string;
}

interface ConnectionStoreState {
  profile: ConnectionProfile | null;
  state: ConnectionState;
  error: string | null;
  saveProfile: (profile: {
    providerId: ProviderId;
    baseUrl: string;
    serverVersion?: string;
  }) => void;
  /** Ignored unless `baseUrl` is still the saved server, so a late reply can't land on another one. */
  setServerVersion: (baseUrl: string, serverVersion: string | undefined) => void;
  markConnecting: () => void;
  markDisconnected: (error?: string | null) => void;
  /** Drops the saved server; the password is the caller's to clear. */
  forget: () => void;
}

export function createConnectionStore(storage = mmkvStorage) {
  return create<ConnectionStoreState>()(
    persist(
      (set) => ({
        profile: null,
        state: "disconnected",
        error: null,
        saveProfile: (profile) => set({ profile, state: "connected", error: null }),
        setServerVersion: (baseUrl, serverVersion) =>
          set((state) =>
            state.profile?.baseUrl === baseUrl && state.profile.serverVersion !== serverVersion
              ? { profile: { ...state.profile, serverVersion } }
              : {},
          ),
        markConnecting: () => set({ state: "connecting", error: null }),
        markDisconnected: (error = null) => set({ state: "disconnected", error }),
        forget: () => set({ profile: null, state: "disconnected", error: null }),
      }),
      {
        name: "connection",
        storage: createJSONStorage(() => storage),
        partialize: (state) => ({ profile: state.profile }),
      },
    ),
  );
}

export const useConnectionStore = createConnectionStore();
