/**
 * JS face of the local TurnNotifier Expo module (Android only).
 *
 * `TurnNotifier` is null where the native side is absent: iOS, web, Jest, and
 * dev clients built before the module was added.
 */

import { requireOptionalNativeModule } from "expo";

/**
 * The headless task `startWork` holds open. It must be registered with
 * `AppRegistry.registerHeadlessTask` and never settle on its own.
 */
export const TURN_TASK_KEY = "OpenChatTurns";

export interface TurnNotifierModule {
  /**
   * Starts (or updates the text of) the foreground service that keeps the app
   * running while replies stream. Android 12+ may refuse to start it while
   * the app is in the background; that is not reported.
   */
  startWork(text: string): void;
  stopWork(): void;
  notify(tag: string, title: string, body: string, url: string): void;
  dismiss(tag: string): void;
}

export const TurnNotifier = requireOptionalNativeModule<TurnNotifierModule>("TurnNotifier");
