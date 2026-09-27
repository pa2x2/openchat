import { useEffect, useState } from "react";
import { Animated, Easing, View } from "react-native";
import { cn } from "@/src/lib/cn";
import { useAppTheme, withAlpha } from "./theme";

/** Most requests answer within this; a bar that flashes for them is noise. */
const SHOW_DELAY_MS = 250;
/** Share of the track the indeterminate bar covers. */
const SEGMENT = 0.4;

export interface LinearProgressProps {
  /** 0–1. Omit (or pass null) for an indeterminate bar. */
  progress?: number | null;
  /** Show at once instead of after a short delay. */
  immediate?: boolean;
  className?: string;
  testID?: string;
}

export function LinearProgress({
  progress = null,
  immediate = false,
  className,
  testID,
}: LinearProgressProps) {
  const { colors } = useAppTheme();
  const [width, setWidth] = useState(0);
  const [opacity] = useState(() => new Animated.Value(immediate ? 1 : 0));
  const [slide] = useState(() => new Animated.Value(0));
  const indeterminate = progress === null;

  useEffect(() => {
    if (immediate) return;
    const fade = Animated.timing(opacity, {
      toValue: 1,
      duration: 150,
      delay: SHOW_DELAY_MS,
      useNativeDriver: true,
    });
    fade.start();
    return () => fade.stop();
  }, [immediate, opacity]);

  useEffect(() => {
    if (!indeterminate) return;
    const loop = Animated.loop(
      Animated.timing(slide, {
        toValue: 1,
        duration: 1100,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [indeterminate, slide]);

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityValue={
        indeterminate ? undefined : { min: 0, max: 100, now: Math.round(progress * 100) }
      }
      style={{ opacity }}
      testID={testID}
    >
      <View
        className={cn("h-[3px] overflow-hidden rounded-full", className)}
        style={{ backgroundColor: withAlpha(colors.primary, 0.2) }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        {indeterminate ? (
          <Animated.View
            style={{
              height: "100%",
              borderRadius: 999,
              backgroundColor: colors.primary,
              width: width * SEGMENT,
              transform: [
                {
                  translateX: slide.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-width * SEGMENT, width],
                  }),
                },
              ],
            }}
          />
        ) : (
          <View
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.round(Math.min(Math.max(progress, 0), 1) * 100)}%` }}
          />
        )}
      </View>
    </Animated.View>
  );
}
