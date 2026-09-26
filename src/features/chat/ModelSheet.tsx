/**
 * Model picker sheet: the provider's model catalog in a bottom sheet, laid
 * out like T3 Code's picker. A rail on the left switches between Favorites
 * and each upstream provider; the list on the right shows that provider's
 * models, starred ones first. Typing in the search field looks across every
 * provider at once.
 *
 * The list comes from the models store (cached locally, refreshed from the
 * server every time the sheet opens). Selecting a row reports the model and
 * closes the sheet; the caller decides what the choice means (switch the
 * current chat or save it as the default).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  SectionList,
  Text,
  TextInput,
  View,
} from "react-native";
import type { ModelInfo, ModelRef } from "@/src/domain";
import { cn } from "@/src/lib/cn";
import { modelKey, sameModelRef, useModelsStore } from "@/src/stores/models";
import { Button } from "@/src/ui/Button";
import { Icon } from "@/src/ui/Icon";
import { GroupLabel } from "@/src/ui/ListGroup";
import { Sheet } from "@/src/ui/Sheet";
import { useAppTheme } from "@/src/ui/theme";
import { favoriteModels, groupByProvider, monogram, searchGroups } from "./modelPicker";

/** A context window as a short size, e.g. 200000 → "200K", 1048576 → "1M". */
export function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${Number((tokens / 1_000_000).toFixed(1))}M`;
  }
  return `${Math.round(tokens / 1_000)}K`;
}

/** Rail entry for the starred models; never clashes with a provider id in practice. */
const FAVORITES = "favorites";

interface Section {
  key: string;
  title: string;
  data: ModelInfo[];
}

export interface ModelSheetProps {
  visible: boolean;
  onClose: () => void;
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

  // Keys the browser, so each opening starts fresh: empty search, the opening
  // tab, the selected model scrolled into view. The Sheet unmounts it after
  // closing anyway; this covers a reopen while the close is still animating.
  const [opening, setOpening] = useState(0);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setOpening(opening + 1);
  }

  function handleSelect(model: ModelInfo) {
    onSelect(model);
    onClose();
  }

  return (
    <Sheet visible={visible} onClose={onClose} height="80%" testID="model-sheet">
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
        <ModelBrowser key={opening} models={models} selected={selected} onSelect={handleSelect} />
      )}
    </Sheet>
  );
}

function ModelBrowser({
  models,
  selected,
  onSelect,
}: {
  models: ModelInfo[];
  selected?: ModelRef | null;
  onSelect: (model: ModelInfo) => void;
}) {
  const favorites = useModelsStore((state) => state.favorites);
  const toggleFavorite = useModelsStore((state) => state.toggleFavorite);
  const [query, setQuery] = useState("");
  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const groups = useMemo(() => groupByProvider(models, favoriteSet), [models, favoriteSet]);
  const searching = query.trim().length > 0;

  /**
   * Where the sheet opens: the selected model's provider, else Favorites
   * when any starred model is on offer, else the first provider.
   */
  function openingTab(): string {
    if (selected && groups.some((group) => group.id === selected.provider)) {
      return selected.provider;
    }
    if (favoriteModels(models, favorites).length > 0) return FAVORITES;
    return groups[0]?.id ?? FAVORITES;
  }

  // Null until the user picks one. The opening tab is resolved on render, so
  // a catalog that arrives after opening still lands on the right provider.
  const [tab, setTab] = useState<string | null>(null);
  const listRef = useRef<SectionList<ModelInfo, Section>>(null);
  const scrollRetries = useRef(0);

  // A provider that left the catalog falls back like a fresh opening.
  const activeTab =
    tab !== null && (tab === FAVORITES || groups.some((group) => group.id === tab))
      ? tab
      : openingTab();

  const sections: Section[] = useMemo(() => {
    if (searching) {
      return searchGroups(groups, query).map((group) => ({
        key: group.id,
        title: group.label,
        data: group.models,
      }));
    }
    if (activeTab === FAVORITES) {
      return [{ key: FAVORITES, title: "Favorites", data: favoriteModels(models, favorites) }];
    }
    const group = groups.find((each) => each.id === activeTab);
    return group ? [{ key: group.id, title: group.label, data: group.models }] : [];
  }, [searching, groups, query, activeTab, models, favorites]);

  const labelOf = useMemo(() => new Map(groups.map((group) => [group.id, group.label])), [groups]);

  // Runs on every content size change: the list renders its rows in batches,
  // and a scroll made before the batch holding the selected row has landed
  // stops short at the end of the content rendered so far.
  function scrollToSelected() {
    if (!selected || searching) return;
    const index = sections[0]?.data.findIndex((model) => sameModelRef(model.ref, selected)) ?? -1;
    // Rows near the top are already in view.
    if (index < 4) return;
    // In a SectionList, item 0 is the section header.
    scrollToRow(index + 1);
  }

  function scrollToRow(itemIndex: number) {
    listRef.current?.scrollToLocation({
      sectionIndex: 0,
      itemIndex,
      viewPosition: 0.5,
      animated: false,
    });
  }

  // The first content size change comes before any row is measured, so that
  // scroll fails; retry once rows have laid out. Capped, as a list that never
  // measures would otherwise retry every frame.
  function retryScroll({ index }: { index: number }) {
    if (scrollRetries.current >= 5) return;
    scrollRetries.current += 1;
    // With a single section, the flat index the list reports is the item index.
    requestAnimationFrame(() => scrollToRow(index));
  }

  const emptyText = searching
    ? "No models match."
    : activeTab === FAVORITES
      ? "Tap the star on a model to keep it here."
      : "No models.";

  return (
    <View className="flex-1">
      <View className="flex-1 flex-row gap-2">
        <ProviderRail
          entries={[
            { id: FAVORITES, label: "Favorites" },
            ...groups.map((group) => ({ id: group.id, label: group.label })),
          ]}
          active={searching ? null : activeTab}
          disabled={searching}
          onSelect={setTab}
        />
        <SectionList
          // A fresh list per tab, so switching providers starts at the top.
          key={searching ? "search" : activeTab}
          ref={listRef}
          sections={sections}
          className="flex-1"
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          initialNumToRender={20}
          keyExtractor={(model) => modelKey(model.ref)}
          onContentSizeChange={scrollToSelected}
          onScrollToIndexFailed={retryScroll}
          // Search mixes providers, so each group is named; otherwise the
          // rail already says which list this is.
          renderSectionHeader={({ section }) =>
            searching ? <GroupLabel>{section.title}</GroupLabel> : null
          }
          ListEmptyComponent={
            <Text
              className="px-4 py-10 text-center text-sm text-text-muted"
              testID="model-list-empty"
            >
              {emptyText}
            </Text>
          }
          renderItem={({ item, index, section }) => (
            <ModelRow
              model={item}
              // Favorites mix providers, so each row says where it comes from.
              providerLabel={
                section.key === FAVORITES
                  ? (labelOf.get(item.ref.provider) ?? item.ref.provider)
                  : undefined
              }
              first={index === 0}
              last={index === section.data.length - 1}
              active={selected ? sameModelRef(item.ref, selected) : false}
              favorite={favoriteSet.has(modelKey(item.ref))}
              onPress={() => onSelect(item)}
              onToggleFavorite={() => {
                // Pin the tab, so unstarring the last favorite does not move
                // an implicitly opened Favorites tab to another provider.
                setTab(activeTab);
                toggleFavorite(item.ref);
              }}
            />
          )}
        />
      </View>
      <SearchField value={query} onChangeText={setQuery} />
    </View>
  );
}

function SearchField({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (text: string) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View className="mt-2 h-11 flex-row items-center gap-2 rounded-full bg-raised pl-3.5 pr-1">
      <Icon name="magnify" size={20} tone="textMuted" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Search models"
        placeholderTextColor={colors.textFaint}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel="Search models"
        className="flex-1 py-0 text-[15px] text-text"
        testID="model-search"
      />
      {value ? (
        <Pressable
          onPress={() => onChangeText("")}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          className="h-9 w-9 items-center justify-center rounded-full active:bg-raised-hover"
          testID="model-search-clear"
        >
          <Icon name="close" size={18} tone="textMuted" />
        </Pressable>
      ) : null}
    </View>
  );
}

function ProviderRail({
  entries,
  active,
  disabled,
  onSelect,
}: {
  entries: { id: string; label: string }[];
  /** Highlighted entry; null while searching, when the rail does not apply. */
  active: string | null;
  disabled: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <ScrollView
      className={cn("w-[60px] flex-grow-0", disabled && "opacity-40")}
      contentContainerClassName="gap-1 pb-2"
      showsVerticalScrollIndicator={false}
      accessibilityLabel="Providers"
    >
      {entries.map((entry) => {
        const on = entry.id === active;
        return (
          <Pressable
            key={entry.id}
            onPress={() => onSelect(entry.id)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={entry.label}
            accessibilityState={{ selected: on, disabled }}
            className="items-center gap-1 rounded-2xl pb-1.5 pt-1"
            testID={`model-provider-${entry.id}`}
          >
            <View
              className={cn(
                "h-10 w-10 items-center justify-center rounded-xl",
                on ? "bg-text" : "bg-raised",
              )}
            >
              {entry.id === FAVORITES ? (
                <Icon
                  name={on ? "star" : "star-outline"}
                  size={20}
                  tone={on ? "background" : "textMuted"}
                />
              ) : (
                <Text
                  className={cn(
                    "text-sm font-semibold",
                    on ? "text-background" : "text-text-muted",
                  )}
                >
                  {monogram(entry.label)}
                </Text>
              )}
            </View>
            <Text
              className={cn(
                "max-w-[58px] text-center text-[10.5px] leading-[13px]",
                on ? "font-medium text-text" : "text-text-muted",
              )}
              numberOfLines={2}
            >
              {entry.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function ModelRow({
  model,
  providerLabel,
  first,
  last,
  active,
  favorite,
  onPress,
  onToggleFavorite,
}: {
  model: ModelInfo;
  /** Shown before the id when rows from several providers share a list. */
  providerLabel?: string;
  first: boolean;
  last: boolean;
  active: boolean;
  favorite: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
}) {
  const detail = [
    providerLabel,
    model.ref.id,
    model.contextWindow ? formatContextWindow(model.contextWindow) : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  const testSuffix = `${model.ref.provider}-${model.ref.id}`;

  return (
    <View
      className={cn(
        "overflow-hidden bg-raised",
        // Each row is its own view, and fractional row heights can leave a
        // sub-pixel gap that shows the sheet through as a full-width seam.
        // Overlapping by 1dp closes it.
        !first && "-mt-px",
        first && "rounded-t-[20px]",
        last && "rounded-b-[20px]",
      )}
    >
      {!first ? <View className="mx-3.5 h-px bg-border" /> : null}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${model.label}, ${providerLabel ?? model.providerLabel ?? model.ref.provider}`}
        accessibilityState={{ selected: active }}
        className="min-h-[60px] flex-row items-center gap-1 py-2.5 pl-3.5 pr-1 active:bg-raised-hover"
        testID={`model-option-${testSuffix}`}
      >
        <View className="flex-1">
          <Text className="text-base font-medium text-text" numberOfLines={1}>
            {model.label}
          </Text>
          <Text className="mt-0.5 text-[13px] text-text-muted" numberOfLines={1}>
            {detail}
          </Text>
        </View>
        {active ? (
          <View testID="model-selected">
            <Icon name="check" size={22} tone="primary" />
          </View>
        ) : null}
        <Pressable
          onPress={onToggleFavorite}
          accessibilityRole="button"
          accessibilityLabel={
            favorite ? `Remove ${model.label} from favorites` : `Add ${model.label} to favorites`
          }
          accessibilityState={{ selected: favorite }}
          className="h-11 w-11 items-center justify-center rounded-full active:bg-raised-hover"
          testID={`model-favorite-${testSuffix}`}
        >
          <Icon
            name={favorite ? "star" : "star-outline"}
            size={20}
            tone={favorite ? "tintAmber" : "textFaint"}
          />
        </Pressable>
      </Pressable>
    </View>
  );
}
