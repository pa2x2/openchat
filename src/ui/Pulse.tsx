import { useEffect, useState, type ReactNode } from "react";
import { Animated, Easing } from "react-native";

/**
 * Gently pulses its children's opacity: the "work in progress" cue used for
 * "Thinking…" and the dot that trails a streaming reply.
 */
export function Pulse({ children }: { children: ReactNode }) {
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
}
