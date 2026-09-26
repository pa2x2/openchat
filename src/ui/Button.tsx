import { Text } from "react-native";
import { Pressable } from "./Pressable";
import { cn } from "@/src/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  className?: string;
  testID?: string;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-primary active:bg-primary/80",
  secondary: "bg-raised active:bg-raised-hover",
  danger: "bg-danger active:bg-danger/80",
  ghost: "bg-transparent active:bg-surface-hover",
};

const variantTextClasses: Record<ButtonVariant, string> = {
  primary: "text-primary-foreground",
  secondary: "text-text",
  danger: "text-primary-foreground",
  ghost: "text-primary",
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
  className,
  testID,
}: ButtonProps) {
  const sizes = sizeClasses[size];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={label}
      className={cn(
        "items-center justify-center",
        sizes.button,
        variantClasses[variant],
        disabled && "opacity-50",
        className,
      )}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
    >
      <Text className={cn("font-medium", sizes.text, variantTextClasses[variant])}>{label}</Text>
    </Pressable>
  );
}
