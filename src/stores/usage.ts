/**
 * Usage store — the reports the usage screen shows, and what the chats this
 * device deleted had used.
 *
 * A backend's report may count only the chats it still has. So a chat's usage
 * is kept here when the app deletes it, per server, and added to every
 * report. Only that is persisted: a report is read again on each visit, and
 * the last one stays up while the next loads.
 */

import {
  mergeReports,
  transcriptUsage,
  type ChatId,
  type Message,
  type UsageEntry,
  type UsageQuery,
  type UsageReport,
} from "@/src/domain";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { getProvider } from "@/src/lib/providerFactory";
import { useConnectionStore } from "./connection";
import { mmkvStorage } from "./storage";

interface UsageStoreState {
  /** By server URL, then chat. */
  deleted: Record<string, Record<ChatId, UsageEntry[]>>;
  /** Call once the chat is gone from the server: before that, its report still counts it. */
  keepDeleted: (server: string, chatId: ChatId, transcript: readonly Message[]) => void;
  forgetServer: (server: string) => void;
  /** The server `reports` are of. */
  server: string | null;
  /** By a key of the caller's, one per span it shows. */
  reports: Record<string, UsageReport>;
  loading: Record<string, true>;
  /** Spans whose last load failed; their earlier report, if any, is still in `reports`. */
  failed: Record<string, true>;
  load: (key: string, query: UsageQuery) => Promise<void>;
}

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

export function createUsageStore(storage = mmkvStorage) {
  return create<UsageStoreState>()(
    persist(
      (set, get) => ({
        deleted: {},
        keepDeleted: (server, chatId, transcript) => {
          const entries = transcript.map(
            ({ role, createdAt, model, usage, cost, requests }): UsageEntry => ({
              role,
              createdAt,
              model,
              usage,
              cost,
              requests,
            }),
          );
          if (!entries.some((entry) => entry.usage)) return;
          set((state) => ({
            deleted: {
              ...state.deleted,
              [server]: { ...state.deleted[server], [chatId]: entries },
            },
          }));
        },
        forgetServer: (server) =>
          set((state) => ({
            deleted: without(state.deleted, server),
            ...(state.server === server ? { server: null, reports: {}, failed: {} } : {}),
          })),
        server: null,
        reports: {},
        loading: {},
        failed: {},
        load: async (key, query) => {
          const server = useConnectionStore.getState().profile?.baseUrl ?? null;
          if (server !== get().server) set({ server, reports: {}, loading: {}, failed: {} });
          if (get().loading[key]) return;
          set((state) => ({ loading: { ...state.loading, [key]: true } }));
          let report: UsageReport | null = null;
          try {
            const provider = await getProvider();
            if (server && provider?.usageReport) {
              const counted = await provider.usageReport(query);
              const deleted = Object.values(get().deleted[server] ?? {});
              report = mergeReports(counted, transcriptUsage(deleted, query));
            }
          } catch {
            report = null;
          }
          // The answer of a server the app has left since is no longer wanted.
          if (get().server !== server) return;
          set((state) => ({
            loading: without(state.loading, key),
            ...(report
              ? { reports: { ...state.reports, [key]: report }, failed: without(state.failed, key) }
              : { failed: { ...state.failed, [key]: true } }),
          }));
        },
      }),
      {
        name: "usage",
        storage: createJSONStorage(() => storage),
        partialize: (state) => ({ deleted: state.deleted }),
      },
    ),
  );
}

export const useUsageStore = createUsageStore();
