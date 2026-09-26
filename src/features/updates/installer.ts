/**
 * Device side of an update: download the APK into the cache, then hand it to
 * the native AppInstaller module. Android only; `updatesSupported` is false
 * everywhere else.
 */

import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { AppInstaller } from "@/modules/app-installer";
import type { AppRelease } from "./releases";

export const updatesSupported = Platform.OS === "android" && AppInstaller !== null;

export function supportedAbis(): readonly string[] {
  return AppInstaller?.supportedAbis ?? [];
}

function downloadsDirectory(): Directory {
  return new Directory(Paths.cache, "updates");
}

/**
 * Downloads the APK and returns its `file://` URI. A complete earlier download
 * of the same file is reused (the installer re-checks its SHA-256); any other
 * APK left in the folder is removed first.
 */
export async function downloadApk(
  apk: AppRelease["apk"],
  onProgress: (fraction: number | null) => void,
  signal?: AbortSignal,
): Promise<string> {
  const directory = downloadsDirectory();
  directory.create({ intermediates: true, idempotent: true });
  for (const entry of directory.list()) {
    if (entry.name !== apk.name) entry.delete();
  }

  const file = new File(directory, apk.name);
  if (file.exists && file.size === apk.size) {
    onProgress(1);
    return file.uri;
  }
  await File.downloadFileAsync(apk.url, file, {
    idempotent: true,
    signal,
    onProgress: ({ bytesWritten, totalBytes }) => {
      const total = totalBytes > 0 ? totalBytes : apk.size;
      onProgress(total > 0 ? Math.min(bytesWritten / total, 1) : null);
    },
  });
  return file.uri;
}

export function clearDownloads(): void {
  const directory = downloadsDirectory();
  if (directory.exists) directory.delete();
}

export function canInstall(): boolean {
  return AppInstaller?.canRequestInstalls() ?? false;
}

export function openInstallSettings(): void {
  AppInstaller?.openInstallSettings();
}

export function installApk(fileUri: string, sha256: string | null): Promise<void> {
  if (!AppInstaller) return Promise.reject(new Error("Updates are not supported on this device."));
  return AppInstaller.install(fileUri, sha256);
}
