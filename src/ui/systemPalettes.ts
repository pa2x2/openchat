/**
 * The device's Material You palettes, kept current while the app runs.
 *
 * Android recomputes them when the user changes wallpaper or colour style,
 * which always happens outside the app, so they are re-read whenever the app
 * returns to the foreground.
 */

import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { create } from "zustand";
import { DynamicColors, type SystemPalettes } from "@/modules/dynamic-colors";

/** Whether this device can offer Material You colours. */
export const dynamicColorsSupported =
  Platform.OS === "android" && DynamicColors !== null && DynamicColors.supported;

function readPalettes(): SystemPalettes | null {
  if (!dynamicColorsSupported) return null;
  try {
    return DynamicColors?.getPalettes() ?? null;
  } catch {
    return null;
  }
}

export const useSystemPalettesStore = create<{ palettes: SystemPalettes | null }>(() => ({
  // Read synchronously, so the first frame already has the right colours.
  palettes: readPalettes(),
}));

/** Re-reads the palettes each time the app comes to the foreground. */
export function useSystemPalettesSync(): void {
  useEffect(() => {
    if (!dynamicColorsSupported) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      const next = readPalettes();
      const current = useSystemPalettesStore.getState().palettes;
      // A new object would rebuild every themed style; only swap on a change.
      if (JSON.stringify(next) !== JSON.stringify(current)) {
        useSystemPalettesStore.setState({ palettes: next });
      }
    });
    return () => subscription.remove();
  }, []);
}
