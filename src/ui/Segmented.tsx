import { Text, View } from "react-native";
import { Pressable } from "./Pressable";
import { cn } from "@/src/lib/cn";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Each option gets `${testIDPrefix}-${value}`. */
  testIDPrefix?: string;
}

/** Single-choice pill row on a surface card, e.g. the appearance setting. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  testIDPrefix,
}: SegmentedProps<T>) {
  return (
    <View className="flex-row rounded-[20px] bg-surface p-1" accessibilityRole="radiogroup">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: active }}
            className={cn(
              "h-10 flex-1 items-center justify-center rounded-2xl",
              active ? "bg-selected" : "active:bg-surface-hover",
            )}
            onPress={() => onChange(option.value)}
            testID={testIDPrefix ? `${testIDPrefix}-${option.value}` : undefined}
          >
            <Text
              className={cn("text-[15px]", active ? "font-medium text-text" : "text-text-muted")}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
