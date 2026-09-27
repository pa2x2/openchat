import { createContext, use } from "react";
import { Text as RNText, type TextProps } from "react-native";
import { cn } from "@/src/lib/cn";

export type { TextProps };

// Nested Text inherits its parent's colour, as markdown spans and links rely
// on, so only the outermost one gets the default.
const InsideText = createContext(false);

/**
 * React Native's `Text`, defaulting to the palette's text colour. Bare, it is
 * black, which vanishes on the dark canvas. A colour class or a `style` colour
 * still wins over the default.
 */
export function Text({ className, ...props }: TextProps) {
  const nested = use(InsideText);
  if (nested) return <RNText {...props} className={className} />;
  return (
    <InsideText value>
      <RNText {...props} className={cn("text-text", className)} />
    </InsideText>
  );
}
