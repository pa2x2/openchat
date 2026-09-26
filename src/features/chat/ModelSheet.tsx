/**
 * Model picker sheet: the provider's model catalog in a bottom sheet,
 * grouped by the upstream provider that serves each model.
 *
 * The list comes from the models store (cached locally, refreshed from the
 * server every time the sheet opens). Selecting a row reports the model and
 * closes the sheet; the caller decides what the choice means (switch the
 * current chat or save it as the default).
 */

import { useEffect, useMemo } from "react";
import { ActivityIndicator, Pressable, SectionList, Text, View } from "react-native";
import type { ModelInfo, ModelRef } from "@/src/domain";
import { cn } from "@/src/lib/cn";
import { sameModelRef, useModelsStore } from "@/src/stores/models";
import { Button } from "@/src/ui/Button";
import { Icon } from "@/src/ui/Icon";
import { GroupLabel } from "@/src/ui/ListGroup";
import { Sheet } from "@/src/ui/Sheet";

/** A context window as a short size, e.g. 200000 → "200K", 1048576 → "1M". */
export function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${Number((tokens / 1_000_000).toFixed(1))}M`;
  }
  return `${Math.round(tokens / 1_000)}K`;
}

export interface ModelSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Currently active model, marked with a check. */
  selected?: ModelRef | null;
  onSelect: (model: ModelInfo) => void;
  /** Muted line under the title, e.g. what the choice applies to. */
  subtitle?: string;
}

export function ModelSheet({ visible, onClose, selected, onSelect, subtitle }: ModelSheetProps) {
  const models = useModelsStore((state) => state.models);
  const loading = useModelsStore((state) => state.loading);
  const error = useModelsStore((state) => state.error);
  const refresh = useModelsStore((state) => state.refresh);

  useEffect(() => {
    if (visible) void refresh();
  }, [visible, refresh]);

  const sections = useMemo(() => {
    const byProvider = new Map<string, ModelInfo[]>();
    for (const model of models) {
      const list = byProvider.get(model.ref.provider) ?? [];
      list.push(model);
      byProvider.set(model.ref.provider, list);
    }
    return [...byProvider].map(([provider, data]) => ({ provider, data }));
  }, [models]);

  function handleSelect(model: ModelInfo) {
    onSelect(model);
    onClose();
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Model"
      subtitle={subtitle}
      testID="model-sheet"
    >
      {loading && models.length === 0 ? (
        <View className="items-center justify-center py-16" testID="model-loading">
          <ActivityIndicator accessibilityLabel="Loading models" />
        </View>
      ) : error && models.length === 0 ? (
        <View className="items-center justify-center gap-3 px-8 py-10">
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
        <View className="items-center justify-center gap-3 px-8 py-10">
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
        <SectionList
          sections={sections}
          style={{ flexGrow: 0, flexShrink: 1 }}
          stickySectionHeadersEnabled={false}
          keyExtractor={(model) => `${model.ref.provider}/${model.ref.id}`}
          renderSectionHeader={({ section }) => <GroupLabel>{section.provider}</GroupLabel>}
          renderItem={({ item, index, section }) => {
            const active = selected ? sameModelRef(item.ref, selected) : false;
            const first = index === 0;
            const last = index === section.data.length - 1;
            return (
              <View
                className={cn(
                  "overflow-hidden bg-raised",
                  // Each row is its own view, and fractional row heights can
                  // leave a sub-pixel gap that shows the sheet through as a
                  // full-width seam. Overlapping by 1dp closes it.
                  !first && "-mt-px",
                  first && "rounded-t-[20px]",
                  last && "rounded-b-[20px]",
                )}
              >
                {!first ? <View className="mx-4 h-px bg-border" /> : null}
                <Pressable
                  onPress={() => handleSelect(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.label}, ${item.ref.provider}`}
                  accessibilityState={{ selected: active }}
                  className="flex-row items-center gap-3 px-4 py-3 active:bg-raised-hover"
                  testID={`model-option-${item.ref.provider}-${item.ref.id}`}
                >
                  <View className="flex-1">
                    <Text className="text-base font-medium text-text" numberOfLines={1}>
                      {item.label}
                    </Text>
                    <Text className="mt-0.5 text-[13px] text-text-muted" numberOfLines={1}>
                      {item.contextWindow
                        ? `${item.ref.id} · ${formatContextWindow(item.contextWindow)} context`
                        : item.ref.id}
                    </Text>
                  </View>
                  {active ? (
                    <View testID="model-selected">
                      <Icon name="check" size={22} tone="primary" />
                    </View>
                  ) : null}
                </Pressable>
              </View>
            );
          }}
        />
      )}
    </Sheet>
  );
}
