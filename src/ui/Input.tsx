import type { ReactNode, Ref } from "react";
import { View } from "react-native";
import { Text } from "./Text";
import { cn } from "@/src/lib/cn";
import { TextInput, type TextInputHandle } from "./TextInput";

export interface InputProps {
  ref?: Ref<TextInputHandle>;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  secureTextEntry?: boolean;
  multiline?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
  keyboardType?: "default" | "numeric" | "url";
  /** Drawn inside the field at its right edge; it takes no touches. */
  trailing?: ReactNode;
  className?: string;
  testID?: string;
}

export function Input({
  ref,
  value,
  onChangeText,
  placeholder,
  label,
  error,
  secureTextEntry,
  multiline,
  autoCapitalize,
  autoCorrect,
  keyboardType,
  trailing,
  className,
  testID,
}: InputProps) {
  return (
    <View className={cn("w-full gap-1.5", className)}>
      {label ? <Text className="text-sm font-medium text-text-muted">{label}</Text> : null}
      <View>
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          secureTextEntry={secureTextEntry}
          multiline={multiline}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          keyboardType={keyboardType}
          accessibilityLabel={label ?? placeholder}
          className={cn(
            "w-full rounded-2xl border bg-background px-4 py-3 text-base",
            error ? "border-danger" : "border-border focus:border-primary",
          )}
          testID={testID}
        />
        {trailing ? (
          <View
            pointerEvents="none"
            className="absolute bottom-0 right-4 top-0 flex-row items-center"
          >
            {trailing}
          </View>
        ) : null}
      </View>
      {error ? (
        <Text className="text-sm text-danger" testID={testID ? `${testID}-error` : undefined}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
