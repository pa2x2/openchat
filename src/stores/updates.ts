/**
 * Updates store — in-app updates from the app's GitHub Releases.
 *
 * Checks the release list for the chosen channel, downloads the APK and hands
 * it to Android's package installer. When and whether the user was already
 * told about a version persists in MMKV; the rest resets on restart.
 *
 * Device and network access come in through `UpdaterDeps` so the flow is
 * testable without native modules.
 */

import Constants from "expo-constants";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  canInstall,
  clearDownloads,
  downloadApk,
  installApk,
  openInstallSettings,
  supportedAbis,
  updatesSupported,
} from "@/src/features/updates/installer";
import {
  fetchReleases,
  selectUpdate,
  type AppRelease,
  type GitHubRelease,
} from "@/src/features/updates/releases";
import { useSettingsStore, type UpdateChannel } from "./settings";
import { mmkvStorage } from "./storage";

/** Automatic checks (launch, return to the app) run at most this often. */
export const AUTO_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export type UpdateStatus =
  | "idle"
  | "checking"
  | "upToDate"
  | "available"
  | "downloading"
  /** Downloaded, waiting for the user to allow installs from this app. */
  | "needsPermission"
  | "installing"
  | "error";

export interface UpdaterDeps {
  supported: boolean;
  appVersion: string;
  channel: () => UpdateChannel;
  abis: () => readonly string[];
  fetchReleases: (signal?: AbortSignal) => Promise<GitHubRelease[]>;
  download: (
    apk: AppRelease["apk"],
    onProgress: (fraction: number | null) => void,
    signal?: AbortSignal,
  ) => Promise<string>;
  clearDownloads: () => void;
  canInstall: () => boolean;
  openInstallSettings: () => void;
  install: (fileUri: string, sha256: string | null) => Promise<void>;
  now: () => number;
}

interface UpdatesStoreState {
  status: UpdateStatus;
  release: AppRelease | null;
  /** Download progress 0–1, or null when the size is unknown. */
  progress: number | null;
  error: string | null;
  lastCheckedAt: number | null;
  /** The version whose prompt the user closed; not offered again on launch. */
  dismissedVersion: string | null;
  sheetOpen: boolean;
  /**
   * Looks for an update on the current channel. `auto` checks are throttled,
   * stay quiet on failure, and open the sheet for a version not yet dismissed.
   */
  check: (options?: { auto?: boolean }) => Promise<void>;
  startUpdate: () => Promise<void>;
  cancelDownload: () => void;
  /** Sends the user to the system screen that allows installs from this app. */
  requestInstallPermission: () => void;
  /** Continues a `needsPermission` install once the permission is granted. */
  resumeInstall: () => Promise<void>;
  openSheet: () => void;
  closeSheet: () => void;
}

const defaultDeps: UpdaterDeps = {
  supported: updatesSupported,
  appVersion: Constants.expoConfig?.version ?? "",
  channel: () => useSettingsStore.getState().updateChannel,
  abis: supportedAbis,
  fetchReleases: (signal) => fetchReleases(fetch, signal),
  download: downloadApk,
  clearDownloads,
  canInstall,
  openInstallSettings,
  install: installApk,
  now: Date.now,
};

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function installErrorMessage(error: unknown): string {
  switch (errorCode(error)) {
    case "E_FILE_MISSING":
    case "E_CHECKSUM":
    case "E_INVALID_APK":
      return "The download was damaged. Try again to download it afresh.";
    case "E_SIGNATURE_MISMATCH":
      return "This update is signed with a different key than the installed app, so Android won't install it over this build. Install it from the releases page instead.";
    case "E_NOT_NEWER":
    case "E_WRONG_PACKAGE":
      return "The downloaded file isn't a newer version of this app.";
    case "E_INSTALL_STORAGE":
      return "There isn't enough free storage to install the update.";
    case "E_INSTALL_INCOMPATIBLE":
      return "This update isn't compatible with your device.";
    default:
      return `The update couldn't be installed. ${errorMessage(error, "")}`.trim();
  }
}

export function createUpdatesStore(storage = mmkvStorage, overrides: Partial<UpdaterDeps> = {}) {
  const deps: UpdaterDeps = { ...defaultDeps, ...overrides };
  let checkController: AbortController | null = null;
  let downloadController: AbortController | null = null;
  let downloadedUri: string | null = null;

  return create<UpdatesStoreState>()(
    persist(
      (set, get) => {
        async function install() {
          const { release } = get();
          if (!release || !downloadedUri) return;
          if (!deps.canInstall()) {
            set({ status: "needsPermission" });
            return;
          }
          set({ status: "installing", error: null });
          try {
            // Success closes the app (Android replaces it), so this rarely returns.
            await deps.install(downloadedUri, release.apk.sha256);
            set({ status: "available", sheetOpen: false });
          } catch (error) {
            const code = errorCode(error);
            // A newer install call took over and owns the status now.
            if (code === "E_INSTALL_SUPERSEDED") return;
            if (code === "E_INSTALL_CANCELLED") {
              set({ status: "available" });
              return;
            }
            if (code === "E_CHECKSUM" || code === "E_INVALID_APK" || code === "E_FILE_MISSING") {
              deps.clearDownloads();
              downloadedUri = null;
            }
            set({ status: "error", error: installErrorMessage(error) });
          }
        }

        return {
          status: "idle",
          release: null,
          progress: null,
          error: null,
          lastCheckedAt: null,
          dismissedVersion: null,
          sheetOpen: false,

          check: async ({ auto = false } = {}) => {
            if (!deps.supported) return;
            const { status, lastCheckedAt } = get();
            // Never swap the release out from under a download or install.
            if (["downloading", "needsPermission", "installing"].includes(status)) return;
            if (
              auto &&
              lastCheckedAt !== null &&
              deps.now() - lastCheckedAt < AUTO_CHECK_INTERVAL_MS
            ) {
              return;
            }

            // A newer check (say, after a channel switch) replaces a running one.
            checkController?.abort();
            const controller = new AbortController();
            checkController = controller;
            set({ status: "checking", error: null });
            try {
              const releases = await deps.fetchReleases(controller.signal);
              if (controller.signal.aborted) return;
              const release = selectUpdate(releases, deps.channel(), deps.appVersion, deps.abis());
              if (!release) {
                deps.clearDownloads();
                downloadedUri = null;
              }
              set({
                status: release ? "available" : "upToDate",
                release,
                progress: null,
                lastCheckedAt: deps.now(),
              });
              if (release && auto && release.version !== get().dismissedVersion) {
                set({ sheetOpen: true });
              }
            } catch (error) {
              if (controller.signal.aborted) return;
              // Background checks fail silently; the user never asked for them.
              set(
                auto
                  ? { status: get().release ? "available" : "idle" }
                  : { status: "error", error: errorMessage(error, "The update check failed.") },
              );
            } finally {
              if (checkController === controller) checkController = null;
            }
          },

          startUpdate: async () => {
            const { release, status } = get();
            if (!release || ["checking", "downloading", "installing"].includes(status)) return;
            const controller = new AbortController();
            downloadController = controller;
            set({ status: "downloading", progress: 0, error: null });
            try {
              downloadedUri = await deps.download(
                release.apk,
                (progress) => {
                  if (!controller.signal.aborted) set({ progress });
                },
                controller.signal,
              );
            } catch (error) {
              set(
                controller.signal.aborted
                  ? { status: "available", progress: null }
                  : {
                      status: "error",
                      progress: null,
                      error: `The download failed. ${errorMessage(error, "")}`.trim(),
                    },
              );
              return;
            } finally {
              if (downloadController === controller) downloadController = null;
            }
            set({ progress: 1 });
            await install();
          },

          cancelDownload: () => downloadController?.abort(),

          requestInstallPermission: () => deps.openInstallSettings(),

          resumeInstall: async () => {
            if (get().status !== "needsPermission" || !deps.canInstall()) return;
            await install();
          },

          openSheet: () => set({ sheetOpen: true }),

          closeSheet: () => {
            const { release, status } = get();
            // Closing the prompt means "not now" for this version. A download
            // already under way keeps going and installs when it finishes.
            const dismissed = release && (status === "available" || status === "error");
            set({
              sheetOpen: false,
              ...(dismissed ? { dismissedVersion: release.version } : {}),
            });
          },
        };
      },
      {
        name: "updates",
        storage: createJSONStorage(() => storage),
        partialize: (state) => ({
          lastCheckedAt: state.lastCheckedAt,
          dismissedVersion: state.dismissedVersion,
        }),
      },
    ),
  );
}

export const useUpdatesStore = createUpdatesStore();
