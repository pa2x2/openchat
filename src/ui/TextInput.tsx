import type { Ref } from "react";
import { TextInput as RNTextInput, type TextInputProps as RNTextInputProps } from "react-native";
import { cn } from "@/src/lib/cn";
import { useAppTheme } from "./theme";

/** The native instance a ref points at, for `focus()` and `blur()`. */
export type TextInputHandle = RNTextInput;

export interface TextInputProps extends RNTextInputProps {
  ref?: Ref<TextInputHandle>;
}

/**
 * React Native's `TextInput` with the text, placeholder, cursor and selection
 * in palette colours. Android otherwise draws the text in the system theme's
 * colour and the cursor and selection handles in the system accent, neither of
 * which follows the app palette. Lint bans the plain one; layout stays with
 * the caller.
 */
export function TextInput({ className, ...props }: TextInputProps) {
  const { colors } = useAppTheme();
  return (
    <RNTextInput
      placeholderTextColor={colors.textFaint}
      cursorColor={colors.primary}
      selectionColor={colors.primary}
      selectionHandleColor={colors.primary}
      {...props}
      className={cn("text-text", className)}
    />
  );
}
