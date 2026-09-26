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

/** Where the temporary-chat glyph's outline breaks, in degrees clockwise from 3 o'clock. */
const TEMPORARY_GAPS = [-146, -33, 90];

/**
 * ChatGPT's temporary-chat glyph: a speech bubble (a circle with a square
 * bottom-left corner) broken into three strokes, with a check while temporary
 * mode is on. No icon font ships it and there is no SVG renderer, so the
 * outline is a bordered View and the breaks are cut by small masks painted in
 * `background`, which must be the colour the glyph sits on.
 */
export function TemporaryChatGlyph({
  on,
  tone = "text",
  background = "elevated",
}: {
  on: boolean;
  tone?: PaletteKey;
  background?: PaletteKey;
}) {
  const { colors } = useAppTheme();
  const size = 20;
  const stroke = 1.75;
  const radius = (size - stroke) / 2;
  const gap = { width: 2.6, height: stroke + 2 };
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderBottomLeftRadius: 0,
        borderWidth: stroke,
        borderColor: colors[tone],
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {TEMPORARY_GAPS.map((angle) => {
        const rad = (angle * Math.PI) / 180;
        return (
          <View
            key={angle}
            style={{
              position: "absolute",
              // Positioned inside the border box, so offset by the stroke.
              left: size / 2 - stroke + radius * Math.cos(rad) - gap.width / 2,
              top: size / 2 - stroke + radius * Math.sin(rad) - gap.height / 2,
              width: gap.width,
              height: gap.height,
              backgroundColor: colors[background],
              transform: [{ rotate: `${angle - 90}deg` }],
            }}
          />
        );
      })}
      {on ? <Icon name="check" size={13} tone={tone} /> : null}
    </View>
  );
}
