import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { useSettingsStore } from "@/src/stores/settings";

export type Haptic = "long-press" | "toggle-on" | "toggle-off" | "none";

// `performAndroidHapticsAsync` goes through `View.performHapticFeedback`, so it
// follows the system "Touch feedback" setting and needs no VIBRATE permission.
const androidHaptics: Record<Exclude<Haptic, "none">, Haptics.AndroidHaptics> = {
  "long-press": Haptics.AndroidHaptics.Long_Press,
  "toggle-on": Haptics.AndroidHaptics.Toggle_On,
  "toggle-off": Haptics.AndroidHaptics.Toggle_Off,
};

function playIos(haptic: Exclude<Haptic, "none">): Promise<void> {
  switch (haptic) {
    case "long-press":
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    case "toggle-on":
    case "toggle-off":
      return Haptics.selectionAsync();
  }
}

export function playHaptic(haptic: Haptic): void {
  if (haptic === "none" || !useSettingsStore.getState().haptics) return;
  if (Platform.OS === "android") {
    // Toggle_* need API 34; older devices reject them, so fall back to the
    // click every API level has.
    Haptics.performAndroidHapticsAsync(androidHaptics[haptic]).catch(() => {
      Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Context_Click).catch(() => {});
    });
  } else if (Platform.OS === "ios") {
    playIos(haptic).catch(() => {});
  }
}
