import { Pressable as RNPressable, type PressableProps as RNPressableProps } from "react-native";
import { playHaptic, type Haptic } from "./haptics";

export interface PressableProps extends RNPressableProps {
  /**
   * Played on press. Off by default, as on Android and iOS, where a plain tap
   * gives no haptic: set it only for toggles. Long presses always play
   * `long-press`, since that is how the user knows the hold registered.
   */
  haptic?: Haptic;
}

/** React Native's `Pressable` with haptic feedback. Lint bans the plain one. */
export function Pressable({ haptic = "none", onPress, onLongPress, ...props }: PressableProps) {
  return (
    <RNPressable
      {...props}
      onPress={
        onPress &&
        ((event) => {
          playHaptic(haptic);
          onPress(event);
        })
      }
      onLongPress={
        onLongPress &&
        ((event) => {
          playHaptic("long-press");
          onLongPress(event);
        })
      }
    />
  );
}
