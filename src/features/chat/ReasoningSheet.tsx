/**
 * Reasoning sheet: picks the variant a model runs with — usually its
 * reasoning effort — or "Auto" for the model's own default.
 *
 * The caller passes the variants of the model in use and decides what the
 * choice applies to.
 */

import { Pressable, Text, View } from "react-native";
import type { ModelVariant } from "@/src/domain";
import { Icon } from "@/src/ui/Icon";
import { Sheet } from "@/src/ui/Sheet";

/** Label for running without a variant: the model's own default. */
export const AUTO_LABEL = "Auto";

export interface ReasoningSheetProps {
  visible: boolean;
  onClose: () => void;
  variants: ModelVariant[];
  /** Current variant id; undefined is Auto. */
  selected?: string;
  onSelect: (variant: string | undefined) => void;
}

export function ReasoningSheet({
  visible,
  onClose,
  variants,
  selected,
  onSelect,
}: ReasoningSheetProps) {
  const options: { id: string | undefined; label: string; hint?: string }[] = [
    { id: undefined, label: AUTO_LABEL, hint: "The model's default" },
    ...variants.map((variant) => ({ id: variant.id, label: variant.label })),
  ];

  return (
    <Sheet visible={visible} onClose={onClose} title="Reasoning" testID="reasoning-sheet">
      <View className="overflow-hidden rounded-[20px] bg-raised">
        {options.map((option, index) => {
          const active = option.id === selected;
          return (
            <View key={option.id ?? "auto"}>
              {index > 0 ? <View className="mx-4 h-px bg-border" /> : null}
              <Pressable
                onPress={() => {
                  onSelect(option.id);
                  onClose();
                }}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                accessibilityHint={option.hint}
                accessibilityState={{ selected: active }}
                className="min-h-[52px] flex-row items-center gap-3 px-4 py-3 active:bg-raised-hover"
                testID={`reasoning-option-${option.id ?? "auto"}`}
              >
                <View className="flex-1">
                  <Text className="text-base font-medium text-text">{option.label}</Text>
                  {option.hint ? (
                    <Text className="mt-0.5 text-[13px] text-text-muted">{option.hint}</Text>
                  ) : null}
                </View>
                {active ? <Icon name="check" size={22} tone="primary" /> : null}
              </Pressable>
            </View>
          );
        })}
      </View>
    </Sheet>
  );
}
