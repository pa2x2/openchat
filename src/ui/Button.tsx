import { Text } from "./Text";
import { View } from "react-native";
import { Pressable } from "./Pressable";
import { Spinner } from "./Spinner";
import type { PaletteKey } from "./theme";
import { cn } from "@/src/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "dangerGhost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  /** Also disables the button. */
  loading?: boolean;
  className?: string;
  testID?: string;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-primary active:bg-primary/80",
  secondary: "bg-raised active:bg-raised-hover",
  danger: "bg-danger active:bg-danger/80",
  ghost: "bg-transparent active:bg-surface-hover",
  dangerGhost: "bg-transparent active:bg-danger/10",
};

const variantTextClasses: Record<ButtonVariant, string> = {
  primary: "text-primary-foreground",
  secondary: "text-text",
  danger: "text-primary-foreground",
  ghost: "text-primary",
  dangerGhost: "text-danger",
};

const variantSpinnerTones: Record<ButtonVariant, PaletteKey> = {
  primary: "primaryForeground",
  secondary: "text",
  danger: "primaryForeground",
  ghost: "primary",
  dangerGhost: "danger",
};

const sizeClasses: Record<ButtonSize, { button: string; text: string }> = {
  sm: { button: "px-3.5 py-1.5 rounded-full", text: "text-sm" },
  md: { button: "px-5 py-3 rounded-full", text: "text-base" },
  lg: { button: "px-6 py-3.5 rounded-full", text: "text-lg" },
};

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  className,
  testID,
}: ButtonProps) {
  const sizes = sizeClasses[size];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      accessibilityLabel={label}
      className={cn(
        "items-center justify-center",
        sizes.button,
        variantClasses[variant],
        disabled && !loading && "opacity-50",
        className,
      )}
      onPress={onPress}
      disabled={inactive}
      testID={testID}
    >
      {/* The label stays laid out, invisibly, so the button keeps its size. */}
      <Text
        className={cn(
          "font-medium",
          sizes.text,
          variantTextClasses[variant],
          loading && "opacity-0",
        )}
      >
        {label}
      </Text>
      {loading ? (
        <View className="absolute inset-0 items-center justify-center">
          <Spinner size="small" tone={variantSpinnerTones[variant]} />
        </View>
      ) : null}
    </Pressable>
  );
}
