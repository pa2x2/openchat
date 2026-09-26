/**
 * Models store — the provider's model catalog, cached locally.
 *
 * `refresh()` reads the list from the server through `ChatProvider`; the
 * cached list persists in MMKV so the picker opens instantly and works
 * offline until the server answers. Text-only models are kept; anything
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
  /** Re-reads the model list from the server. Safe to call concurrently. */
  refresh: () => Promise<void>;
  clear: () => void;
}

export function sameModelRef(
  a: { provider: string; id: string },
  b: { provider: string; id: string },
): boolean {
  return a.provider === b.provider && a.id === b.id;
}

/** Identifies a model regardless of variant, e.g. "opencode/big-pickle". */
export function modelKey(ref: { provider: string; id: string }): string {
  return `${ref.provider}/${ref.id}`;
}

/**
 * The ref to run `model` with, keeping `variant` only when the model offers
 * it. The server accepts any variant for any model, so a variant carried
 * over from a different model has to be dropped here.
 */
export function refWithVariant(model: ModelInfo, variant: string | undefined): ModelRef {
  const offered = variant !== undefined && model.variants?.some((each) => each.id === variant);
  return offered ? { ...model.ref, variant } : { provider: model.ref.provider, id: model.ref.id };
}

export function createModelsStore(storage = mmkvStorage) {
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
          if (get().loading) return;
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
