import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { useSettingsStore } from "@/src/stores/settings";

export type Haptic =
  "tap" | "long-press" | "toggle-on" | "toggle-off" | "confirm" | "reject" | "none";

// `performAndroidHapticsAsync` goes through `View.performHapticFeedback`, so it
// follows the system "Touch feedback" setting and needs no VIBRATE permission.
const androidHaptics: Record<Exclude<Haptic, "none">, Haptics.AndroidHaptics> = {
  tap: Haptics.AndroidHaptics.Context_Click,
  "long-press": Haptics.AndroidHaptics.Long_Press,
  "toggle-on": Haptics.AndroidHaptics.Toggle_On,
  "toggle-off": Haptics.AndroidHaptics.Toggle_Off,
  confirm: Haptics.AndroidHaptics.Confirm,
  reject: Haptics.AndroidHaptics.Reject,
};

function playIos(haptic: Exclude<Haptic, "none">): Promise<void> {
  switch (haptic) {
    case "tap":
    case "toggle-on":
    case "toggle-off":
      return Haptics.selectionAsync();
    case "long-press":
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    case "confirm":
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    case "reject":
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }
}

export function playHaptic(haptic: Haptic): void {
  if (haptic === "none" || !useSettingsStore.getState().haptics) return;
  if (Platform.OS === "android") {
    // Confirm/Reject need API 30 and Toggle_* API 34; older devices reject
    // those, so fall back to the click every API level has.
    Haptics.performAndroidHapticsAsync(androidHaptics[haptic]).catch(() => {
      Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Context_Click).catch(() => {});
    });
  } else if (Platform.OS === "ios") {
    playIos(haptic).catch(() => {});
  }
}
