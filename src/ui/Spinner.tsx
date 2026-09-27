import { ActivityIndicator, type ActivityIndicatorProps } from "react-native";
import { useAppTheme, type PaletteKey } from "./theme";

export interface SpinnerProps extends Omit<ActivityIndicatorProps, "color"> {
  tone?: PaletteKey;
}

/**
 * `ActivityIndicator` in a palette colour. Without one it spins in the
 * platform accent on Android and grey on iOS. Lint bans the plain one.
 */
export function Spinner({ tone = "textMuted", ...props }: SpinnerProps) {
  const { colors } = useAppTheme();
  return <ActivityIndicator {...props} color={colors[tone]} />;
}
