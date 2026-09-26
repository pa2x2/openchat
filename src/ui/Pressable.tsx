import { Pressable as RNPressable, type PressableProps as RNPressableProps } from "react-native";
import { playHaptic, type Haptic } from "./haptics";

export interface PressableProps extends RNPressableProps {
  /** Played on press. Long presses always play `long-press`. */
  haptic?: Haptic;
}

/** React Native's `Pressable` with haptic feedback. Lint bans the plain one. */
export function Pressable({ haptic = "tap", onPress, onLongPress, ...props }: PressableProps) {
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
