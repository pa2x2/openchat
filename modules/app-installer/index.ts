/**
 * JS face of the local AppInstaller Expo module (Android only).
 *
 * `AppInstaller` is null where the native side is absent: iOS, web, Jest, and
 * dev clients built before the module was added.
 */

import { requireOptionalNativeModule } from "expo";

export interface AppInstallerModule {
  /** ABIs the device runs, most preferred first (Build.SUPPORTED_ABIS). */
  readonly supportedAbis: string[];
  /** Whether Android lets this app install packages ("Install unknown apps"). */
  canRequestInstalls(): boolean;
  /** Opens the system screen where the user allows this app to install packages. */
  openInstallSettings(): void;
  /**
   * Installs an update APK of this app from a local `file://` URI, checking
   * its SHA-256 first when given. A successful update ends the process,
   * so the promise only settles on failure or cancellation; the rejection's
   * `code` is one of {@link InstallErrorCode}.
   */
  install(fileUri: string, sha256: string | null): Promise<void>;
}

export type InstallErrorCode =
  | "E_FILE_MISSING"
  | "E_CHECKSUM"
  | "E_INVALID_APK"
  | "E_WRONG_PACKAGE"
  | "E_NOT_NEWER"
  | "E_SIGNATURE_MISMATCH"
  | "E_INSTALL_SUPERSEDED"
  | "E_INSTALL_CANCELLED"
  | "E_INSTALL_BLOCKED"
  | "E_INSTALL_CONFLICT"
  | "E_INSTALL_INCOMPATIBLE"
  | "E_INSTALL_STORAGE"
  | "E_INSTALL_FAILED";

export const AppInstaller = requireOptionalNativeModule<AppInstallerModule>("AppInstaller");
