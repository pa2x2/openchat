/**
 * Storage backends for persisted Zustand stores.
 *
 * Persisted state lives in MMKV (fast, synchronous, app-owned). Tests inject
 * an in-memory backend instead, so store logic is testable without native
 * modules.
 */

import { createMMKV, type MMKV } from "react-native-mmkv";
import type { StateStorage } from "zustand/middleware";

let instance: MMKV | undefined;

function mmkv(): MMKV {
  instance ??= createMMKV();
  return instance;
}

export const mmkvStorage: StateStorage = {
  getItem: (name) => mmkv().getString(name) ?? null,
  setItem: (name, value) => {
    mmkv().set(name, value);
  },
  removeItem: (name) => {
    mmkv().remove(name);
  },
};

export function createMemoryStorage(): StateStorage {
  const map = new Map<string, string>();
  return {
    getItem: (name) => map.get(name) ?? null,
    setItem: (name, value) => {
      map.set(name, value);
    },
    removeItem: (name) => {
      map.delete(name);
    },
  };
}
