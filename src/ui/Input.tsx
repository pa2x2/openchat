import { forwardRef } from "react";
import { TextInput, View, Text } from "react-native";
import { cn } from "@/src/lib/cn";

export interface InputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  secureTextEntry?: boolean;
  multiline?: boolean;
  className?: string;
  testID?: string;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { value, onChangeText, placeholder, label, error, secureTextEntry, multiline, className, testID },
  ref,
) {
  return (
    <View className={cn("w-full gap-1.5", className)}>
      {label ? <Text className="text-sm font-medium text-text-muted">{label}</Text> : null}
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgb(var(--oc-text-muted))"
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        accessibilityLabel={label ?? placeholder}
        className={cn(
          "w-full rounded-xl border border-border bg-surface px-4 py-3 text-base text-text",
          "focus:border-primary",
          error && "border-danger",
        )}
        testID={testID}
      />
      {error ? (
        <Text className="text-sm text-danger" testID={testID ? `${testID}-error` : undefined}>
          {error}
        </Text>
      ) : null}
    </View>
  );
});
