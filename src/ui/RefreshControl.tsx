import {
  RefreshControl as RNRefreshControl,
  type RefreshControlProps as RNRefreshControlProps,
} from "react-native";
import { useAppTheme } from "./theme";

export type RefreshControlProps = Omit<
  RNRefreshControlProps,
  "colors" | "progressBackgroundColor" | "tintColor"
>;

/**
 * Pull-to-refresh in palette colours. The Android default is a white disc
 * with a system-accent arrow, which glares on a dark canvas. Lint bans the
 * plain one.
 */
export function RefreshControl(props: RefreshControlProps) {
  const { colors } = useAppTheme();
  return (
    <RNRefreshControl
      {...props}
      colors={[colors.primary]}
      progressBackgroundColor={colors.elevated}
      tintColor={colors.textMuted}
    />
  );
}
