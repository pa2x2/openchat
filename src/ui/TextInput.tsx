import type { Ref } from "react";
import { TextInput as RNTextInput, type TextInputProps as RNTextInputProps } from "react-native";
import { useAppTheme } from "./theme";

/** The native instance a ref points at, for `focus()` and `blur()`. */
export type TextInputHandle = RNTextInput;

export interface TextInputProps extends RNTextInputProps {
  ref?: Ref<TextInputHandle>;
}

/**
 * React Native's `TextInput` with the placeholder, cursor and selection in
 * palette colours. Android otherwise draws the cursor and selection handles
 * in the system accent. Lint bans the plain one; layout stays with the caller.
 */
export function TextInput(props: TextInputProps) {
  const { colors } = useAppTheme();
  return (
    <RNTextInput
      placeholderTextColor={colors.textFaint}
      cursorColor={colors.primary}
      selectionColor={colors.primary}
      selectionHandleColor={colors.primary}
      {...props}
    />
  );
}
