import { View } from "react-native";
import { useAppTheme, type PaletteKey } from "./theme";

export interface ProgressRingProps {
  /** 0 to 1; values outside are clamped. */
  progress: number;
  size?: number;
  stroke?: number;
  tone?: PaletteKey;
  track?: PaletteKey;
}

const SEAM = 0.5;

/**
 * A ring that fills clockwise from the top. There is no SVG renderer, so the
 * arc is two half rings, each turned into view from behind the other half of
 * the circle, where a clip hides it: the first sweeps the right half, the
 * second carries on through the left once the first is fully out.
 */
export function ProgressRing({
  progress,
  size = 20,
  stroke = 3,
  tone = "textMuted",
  track = "raisedHover",
}: ProgressRingProps) {
  const { colors } = useAppTheme();
  const turn = Math.min(1, Math.max(0, progress)) * 360;
  const circle = { width: size, height: size, borderRadius: size / 2, borderWidth: stroke };
  const half = { position: "absolute", width: size / 2, height: size, overflow: "hidden" } as const;

  const sweep = (side: "right" | "left", degrees: number) => {
    const right = side === "right";
    return (
      <View style={[half, { left: right ? size / 2 : 0 }]}>
        <View
          style={{
            position: "absolute",
            left: right ? -size / 2 : 0,
            width: size,
            height: size,
            transform: [{ rotate: `${degrees}deg` }],
          }}
        >
          <View style={[half, { left: right ? 0 : size / 2 }]}>
            <View
              style={[
                circle,
                { position: "absolute", left: right ? 0 : -size / 2, borderColor: colors[tone] },
              ]}
            />
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={{ width: size, height: size }}>
      <View style={[circle, { borderColor: colors[track] }]} />
      {turn > 180 ? (
        <>
          {/* The halves meet on a fraction of a pixel, which leaves a hairline
              of the track between them. The full half reaches over it. */}
          <View style={[half, { left: size / 2 - SEAM, width: size / 2 + SEAM }]}>
            <View
              style={[
                circle,
                { position: "absolute", left: SEAM - size / 2, borderColor: colors[tone] },
              ]}
            />
          </View>
          {sweep("left", turn - 180)}
        </>
      ) : turn > 0 ? (
        sweep("right", turn)
      ) : null}
    </View>
  );
}
