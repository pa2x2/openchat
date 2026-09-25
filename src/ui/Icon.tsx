import MaterialDesignIcons from "@react-native-vector-icons/material-design-icons";
import type { ComponentProps } from "react";
import { View } from "react-native";
import { useAppTheme, type PaletteKey } from "./theme";

export type IconName = ComponentProps<typeof MaterialDesignIcons>["name"];

export interface IconProps {
  name: IconName;
  size?: number;
  /** Semantic palette colour; defaults to body text. */
  tone?: PaletteKey;
  /** Explicit colour, for the rare icon that is not on a palette colour. */
  color?: string;
  testID?: string;
}

/**
 * One icon from the Material Design Icons font, coloured from the palette.
 * The font takes a real colour string, so this resolves the token instead of
 * using a NativeWind class.
 */
export function Icon({ name, size = 22, tone = "text", color, testID }: IconProps) {
  const { colors } = useAppTheme();
  return (
    <MaterialDesignIcons name={name} size={size} color={color ?? colors[tone]} testID={testID} />
  );
}

/**
 * The two-bar "open sidebar" glyph (a full bar over a shorter one). No icon
 * font ships this shape, so it is drawn.
 */
export function MenuGlyph({ tone = "text" }: { tone?: PaletteKey }) {
  const { colors } = useAppTheme();
  const bar = { height: 2, borderRadius: 1, backgroundColor: colors[tone] };
  return (
    <View style={{ width: 18, gap: 5 }}>
      <View style={[bar, { width: 18 }]} />
      <View style={[bar, { width: 11 }]} />
    </View>
  );
}
