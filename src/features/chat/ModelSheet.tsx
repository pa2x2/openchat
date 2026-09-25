/**
 * Model picker sheet: the provider's model catalog in a bottom sheet.
 *
 * The list comes from the models store (cached locally, refreshed from the
 * server every time the sheet opens). Selecting a row reports the model and
 * closes the sheet; the caller decides what the choice means (switch the
 * current chat or save it as the default).
 */

import { useEffect } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import type { ModelInfo, ModelRef } from "@/src/domain";
import { sameModelRef, useModelsStore } from "@/src/stores/models";
import { Button } from "@/src/ui/Button";
import { Sheet } from "@/src/ui/Sheet";

export interface ModelSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Currently active model, marked with a check. */
  selected?: ModelRef | null;
  onSelect: (model: ModelInfo) => void;
}

export function ModelSheet({ visible, onClose, selected, onSelect }: ModelSheetProps) {
  const models = useModelsStore((state) => state.models);
  const loading = useModelsStore((state) => state.loading);
  const error = useModelsStore((state) => state.error);
  const refresh = useModelsStore((state) => state.refresh);

  useEffect(() => {
    if (visible) void refresh();
  }, [visible, refresh]);

  function handleSelect(model: ModelInfo) {
    onSelect(model);
    onClose();
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Model" height="70%" testID="model-sheet">
      {loading && models.length === 0 ? (
        <View className="flex-1 items-center justify-center" testID="model-loading">
          <ActivityIndicator accessibilityLabel="Loading models" />
        </View>
      ) : error && models.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <Text className="text-center text-sm text-danger" testID="model-error">
            {error}
          </Text>
          <Button
            label="Retry"
            variant="secondary"
            onPress={() => void refresh()}
            testID="model-retry"
          />
        </View>
      ) : models.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <Text className="text-center text-sm text-text-muted" testID="model-empty">
            No models found on this server.
          </Text>
          <Button
            label="Retry"
            variant="secondary"
            onPress={() => void refresh()}
            testID="model-retry"
          />
        </View>
      ) : (
        <FlatList
          data={models}
          keyExtractor={(model) => `${model.ref.provider}/${model.ref.id}`}
          renderItem={({ item }) => {
            const active = selected ? sameModelRef(item.ref, selected) : false;
            return (
              <Pressable
                onPress={() => handleSelect(item)}
                accessibilityRole="button"
                accessibilityLabel={`${item.label}, ${item.ref.provider}`}
                accessibilityState={{ selected: active }}
                className="flex-row items-center gap-3 border-b border-border px-1 py-3 active:bg-surface-hover"
                testID={`model-option-${item.ref.provider}-${item.ref.id}`}
              >
                <View className="flex-1">
                  <Text className="text-base font-semibold text-text" numberOfLines={1}>
                    {item.label}
                  </Text>
                  <Text className="mt-0.5 text-xs text-text-muted" numberOfLines={1}>
                    {item.ref.provider} · {item.ref.id}
                  </Text>
                </View>
                {active ? (
                  <Text className="text-base font-bold text-primary" testID="model-selected">
                    ✓
                  </Text>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
    </Sheet>
  );
}
