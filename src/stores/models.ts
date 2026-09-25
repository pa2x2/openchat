/**
 * Models store — the provider's model catalog, cached locally.
 *
 * `refresh()` reads the list from the server through `ChatProvider`; the
 * cached list persists in MMKV so the picker opens instantly and works
 * offline until the server answers. Text-only models are kept; anything
 * else never reaches the picker.
 */

import type { ModelInfo } from "@/src/domain";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { getProvider } from "@/src/lib/providerFactory";
import { mmkvStorage } from "./storage";

interface ModelsStoreState {
  models: ModelInfo[];
  /** True while a server refresh is in flight. */
  loading: boolean;
  /** Last refresh failure, as a user-facing message. */
  error: string | null;
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

export function createModelsStore(storage = mmkvStorage) {
  return create<ModelsStoreState>()(
    persist(
      (set, get) => ({
        models: [],
        loading: false,
        error: null,
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
        // Only the durable list persists; loading/error are live state.
        partialize: (state) => ({ models: state.models }),
      },
    ),
  );
}

export const useModelsStore = createModelsStore();
