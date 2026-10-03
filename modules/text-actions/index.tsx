/**
 * JS face of the local TextActions Expo module (Android only).
 *
 * Where the native side is absent (iOS, web, Jest, and dev clients built
 * before the module was added), `Quotable` is a plain view and offers nothing.
 */

import { requireNativeView, requireOptionalNativeModule } from "expo";
import type { ComponentType, ReactNode } from "react";
import { View, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from "react-native";

interface NativeQuotableProps {
  label: string;
  onQuote: (event: NativeSyntheticEvent<{ text: string }>) => void;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

const NativeQuotable: ComponentType<NativeQuotableProps> | null = requireOptionalNativeModule(
  "TextActions",
)
  ? requireNativeView<NativeQuotableProps>("TextActions")
  : null;

export interface QuotableProps {
  label: string;
  /** Unset, the text inside offers no Quote item. */
  onQuote?: (text: string) => void;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

/** Selected text anywhere inside offers Quote in its selection toolbar. */
export function Quotable({ label, onQuote, style, children }: QuotableProps) {
  if (!NativeQuotable || !onQuote) return <View style={style}>{children}</View>;
  return (
    <NativeQuotable
      label={label}
      onQuote={(event) => onQuote(event.nativeEvent.text)}
      style={style}
    >
      {children}
    </NativeQuotable>
  );
}
