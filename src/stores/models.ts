/**
 * Models store — the provider's model catalog, cached locally.
 *
 * `refresh()` reads the list from the server through `ChatProvider`; the
 * cached list persists in MMKV so the picker opens instantly and works
 * offline until the server answers. `watchCatalog()` re-reads it whenever
 * the server announces a change, so what a restarting server answers before
 * its providers load does not stick. Text-only models are kept; anything
 * else never reaches the picker.
 *
 * Favorites are the models the user starred in the picker, stored as
 * `modelKey`s. They are device-local and outlive the catalog: a starred model
 * the server stops offering is just not shown, and comes back if it returns.
 */

import type { ModelInfo, ModelRef } from "@/src/domain";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { getProvider } from "@/src/lib/providerFactory";
import { mmkvStorage } from "./storage";

interface ModelsStoreState {
  models: ModelInfo[];
  loading: boolean;
  error: string | null;
  /** `modelKey`s of starred models, most recently starred last. */
  favorites: string[];
  toggleFavorite: (ref: ModelRef) => void;
  /**
   * Re-reads the model list from the server. A call made while a read is in
   * flight runs one more read after it, since the first may predate the
   * change the caller heard about.
   */
  refresh: () => Promise<void>;
  clear: () => void;
}

export function sameModelRef(
  a: { provider: string; id: string },
  b: { provider: string; id: string },
): boolean {
  return a.provider === b.provider && a.id === b.id;
}

/** Identifies a model regardless of variant, e.g. "anthropic/claude-sonnet-5". */
export function modelKey(ref: { provider: string; id: string }): string {
  return `${ref.provider}/${ref.id}`;
}

/**
 * The ref to run `model` with, keeping `variant` only when the model offers
 * it. A backend need not reject a variant the model lacks, so a variant
 * carried over from a different model has to be dropped here.
 */
export function refWithVariant(model: ModelInfo, variant: string | undefined): ModelRef {
  const offered = variant !== undefined && model.variants?.some((each) => each.id === variant);
  return offered ? { ...model.ref, variant } : { provider: model.ref.provider, id: model.ref.id };
}

export function createModelsStore(storage = mmkvStorage) {
  let stale = false;
  return create<ModelsStoreState>()(
    persist(
      (set, get) => ({
        models: [],
        loading: false,
        error: null,
        favorites: [],
        toggleFavorite: (ref) => {
          const key = modelKey(ref);
          set((state) => ({
            favorites: state.favorites.includes(key)
              ? state.favorites.filter((each) => each !== key)
              : [...state.favorites, key],
          }));
        },
        refresh: async () => {
          if (get().loading) {
            stale = true;
            return;
          }
          set({ loading: true, error: null });
          try {
            const provider = await getProvider();
            if (!provider) {
              set({ loading: false, error: "Not connected." });
              return;
            }
            const models = await provider.listModels();
            set({ models, loading: false });
          } catch (error) {
            set({
              loading: false,
              error:
                error instanceof Error && error.message ? error.message : "Could not load models.",
            });
          }
          if (stale) {
            stale = false;
            await get().refresh();
          }
        },
        clear: () => set({ models: [], loading: false, error: null }),
      }),
      {
        name: "models",
        storage: createJSONStorage(() => storage),
        partialize: (state) => ({ models: state.models, favorites: state.favorites }),
      },
    ),
  );
}

export const useModelsStore = createModelsStore();

const INITIAL_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 15_000;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * Keeps the catalog in step with the server until `signal` aborts,
 * resubscribing after the change stream drops. A provider that cannot
 * announce changes gets a single read.
 */
export async function watchCatalog(signal: AbortSignal): Promise<void> {
  const { refresh } = useModelsStore.getState();
  let backoffMs = INITIAL_BACKOFF_MS;
  while (!signal.aborted) {
    const provider = await getProvider();
    if (!provider) return;
    if (!provider.catalogChanges) {
      await refresh();
      return;
    }
    const changes = provider.catalogChanges(signal)[Symbol.asyncIterator]();
    while (!(await changes.next()).done) {
      backoffMs = INITIAL_BACKOFF_MS;
      void refresh();
    }
    await sleep(backoffMs, signal);
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
  }
}
