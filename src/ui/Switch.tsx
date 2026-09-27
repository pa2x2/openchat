import { Switch as RNSwitch, type SwitchProps as RNSwitchProps } from "react-native";
import { useAppTheme } from "./theme";

export type SwitchProps = Omit<RNSwitchProps, "trackColor" | "thumbColor" | "ios_backgroundColor">;

/**
 * React Native's `Switch` in palette colours. Left bare it takes the platform
 * accent, which ignores both the app palette and dark mode. Lint bans the
 * plain one.
 */
export function Switch(props: SwitchProps) {
  const { colors } = useAppTheme();
  return (
    <RNSwitch
      {...props}
      trackColor={{ false: colors.border, true: colors.primary }}
      thumbColor={props.value ? colors.primaryForeground : colors.textMuted}
      ios_backgroundColor={colors.border}
    />
  );
}
