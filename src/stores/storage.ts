/**
 * Storage backends for persisted Zustand stores.
 *
 * Persisted state lives in MMKV (fast, synchronous, app-owned). Tests inject
 * an in-memory backend instead, so store logic is testable without native
 * modules.
 */

import { AppState } from "react-native";
import { createMMKV, type MMKV } from "react-native-mmkv";
import type { PersistStorage, StateStorage, StorageValue } from "zustand/middleware";

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

const pendingFlushes = new Set<() => void>();
let flushOnBackground: { remove: () => void } | undefined;

/**
 * A JSON persist storage that writes at most once per `intervalMs`, always
 * the latest state. For stores that change many times a second (the
 * transcript during streaming), where stringifying and writing every change
 * would block the JS thread. Pending writes are flushed when the app leaves
 * the foreground, so a backgrounded-then-killed app loses nothing; a crash
 * can lose the last `intervalMs` of changes.
 */
export function createThrottledJSONStorage<S>(
  getStorage: () => StateStorage,
  intervalMs: number,
): PersistStorage<S> {
  const pending = new Map<string, StorageValue<S>>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  function flush() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    pendingFlushes.delete(flush);
    for (const [name, value] of pending) void getStorage().setItem(name, JSON.stringify(value));
    pending.clear();
  }

  flushOnBackground ??= AppState.addEventListener("change", (state) => {
    if (state === "active") return;
    for (const pendingFlush of [...pendingFlushes]) pendingFlush();
  });

  return {
    getItem: (name) => {
      const queued = pending.get(name);
      if (queued) return queued;
      const raw = getStorage().getItem(name);
      if (raw instanceof Promise)
        throw new Error("createThrottledJSONStorage needs a synchronous storage");
      return raw === null ? null : (JSON.parse(raw) as StorageValue<S>);
    },
    setItem: (name, value) => {
      pending.set(name, value);
      if (timer !== undefined) return;
      pendingFlushes.add(flush);
      timer = setTimeout(flush, intervalMs);
    },
    removeItem: (name) => {
      pending.delete(name);
      void getStorage().removeItem(name);
    },
  };
}
