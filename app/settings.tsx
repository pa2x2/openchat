import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { colorScheme as colorSchemeApi } from "nativewind";
import { ConnectionCard } from "@/src/features/connection/ConnectionCard";
import { ModelSheet } from "@/src/features/chat/ModelSheet";
import { Button } from "@/src/ui/Button";
import { useAppTheme } from "@/src/ui/theme";
import { useProviderCapabilities } from "@/src/lib/providerFactory";
import { sameModelRef, useModelsStore } from "@/src/stores/models";
import { useSettingsStore } from "@/src/stores/settings";
import { useConnectionStore } from "@/src/stores/connection";
import type { ModelInfo } from "@/src/domain";

/**
 * Settings screen.
 *
 * Hosts the server connection form, the theme toggle and the
 * design-primitives demo entry point.
 */
export default function SettingsScreen() {
  const { scheme } = useAppTheme();
  const capabilities = useProviderCapabilities();
  const providerId = useConnectionStore((state) => state.profile?.providerId);
  const defaultModel = useSettingsStore((state) =>
    providerId ? state.defaultModels[providerId] : undefined,
  );
  const setDefaultModel = useSettingsStore((state) => state.setDefaultModel);
  const defaultLabel = useModelsStore((state) =>
    defaultModel
      ? (state.models.find((model) => sameModelRef(model.ref, defaultModel))?.label ?? null)
      : null,
  );
  const [sheetOpen, setSheetOpen] = useState(false);

  const toggleScheme = () => {
    colorSchemeApi.set(scheme === "light" ? "dark" : "light");
  };

  function handleSelectDefault(model: ModelInfo) {
    if (!providerId) return;
    setDefaultModel(providerId, model.ref);
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerClassName="p-4 gap-4">
        <ConnectionCard />

        {capabilities?.modelSelection === true ? (
          <View className="gap-3 rounded-xl border border-border bg-surface p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-semibold text-text">Default model</Text>
              <Pressable
                onPress={() => setSheetOpen(true)}
                accessibilityLabel="Choose default model"
                testID="default-model-button"
              >
                <Text className="text-sm font-semibold text-primary" numberOfLines={1}>
                  {defaultLabel ?? defaultModel?.id ?? "Choose"}
                </Text>
              </Pressable>
            </View>
            <Text className="text-xs text-text-muted">
              New chats start on this model unless you pick another one.
            </Text>
          </View>
        ) : null}

        <View className="gap-3 rounded-xl border border-border bg-surface p-4">
          <Text className="text-base font-semibold text-text">Appearance</Text>
          <Text className="text-sm text-text-muted">Current scheme: {scheme}</Text>
          <Button
            label={`Switch to ${scheme === "light" ? "dark" : "light"}`}
            variant="secondary"
            onPress={toggleScheme}
          />
        </View>

        <Link href="/ui-demo" asChild>
          <Pressable className="rounded-xl border border-border bg-surface p-4 active:bg-surface-hover">
            <Text className="text-base font-semibold text-text">Design primitives demo</Text>
            <Text className="mt-1 text-sm text-text-muted">
              Button, Input, Sheet, Bubble in both schemes
            </Text>
          </Pressable>
        </Link>
        {capabilities?.modelSelection === true ? (
          <ModelSheet
            visible={sheetOpen}
            onClose={() => setSheetOpen(false)}
            selected={defaultModel ?? null}
            onSelect={handleSelectDefault}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}
