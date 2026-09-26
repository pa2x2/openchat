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
  markConnecting: () => void;
  markDisconnected: (error?: string | null) => void;
}

export function createConnectionStore(storage = mmkvStorage) {
  return create<ConnectionStoreState>()(
    persist(
      (set) => ({
        profile: null,
        state: "disconnected",
        error: null,
        saveProfile: (profile) => set({ profile, state: "connected", error: null }),
        markConnecting: () => set({ state: "connecting", error: null }),
        markDisconnected: (error = null) => set({ state: "disconnected", error }),
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
