/**
 * JS face of the local DynamicColors Expo module (Android only).
 *
 * `DynamicColors` is null where the native side is absent: iOS, web, Jest, and
 * dev clients built before the module was added.
 */

import { requireOptionalNativeModule } from "expo";

/** Android's tonal palettes, by name. */
export type SystemPaletteName = "accent1" | "accent2" | "accent3" | "neutral1" | "neutral2";

/**
 * One tonal palette: `#RRGGBB` keyed by Android's shade number ("0" to
 * "1000"). A shade is 1000 minus ten times its Material tone, except "10"
 * (tone 99) and "50" (tone 95).
 */
export type SystemPalette = Record<string, string>;

export type SystemPalettes = Record<SystemPaletteName, SystemPalette>;

export interface DynamicColorsModule {
  /** Whether the OS has Material You colours (Android 12+). */
  readonly supported: boolean;
  /** The current palettes, or null before Android 12. */
  getPalettes(): SystemPalettes | null;
}

export const DynamicColors = requireOptionalNativeModule<DynamicColorsModule>("DynamicColors");
