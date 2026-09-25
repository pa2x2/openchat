import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ConnectionCard } from "@/src/features/connection/ConnectionCard";
import { ModelSheet } from "@/src/features/chat/ModelSheet";
import { cn } from "@/src/lib/cn";
import { useProviderCapabilities } from "@/src/lib/providerFactory";
import { sameModelRef, useModelsStore } from "@/src/stores/models";
import { useSettingsStore, type Appearance } from "@/src/stores/settings";
import { useConnectionStore } from "@/src/stores/connection";
import { Group, GroupLabel, Row } from "@/src/ui/ListGroup";
import type { ModelInfo } from "@/src/domain";

const APPEARANCES: { value: Appearance; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/**
 * Settings screen: the server connection, chat defaults, appearance, and
 * app info, as grouped lists.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const capabilities = useProviderCapabilities();
  const providerId = useConnectionStore((state) => state.profile?.providerId);
  const defaultModel = useSettingsStore((state) =>
    providerId ? state.defaultModels[providerId] : undefined,
  );
  const setDefaultModel = useSettingsStore((state) => state.setDefaultModel);
  const appearance = useSettingsStore((state) => state.appearance);
  const setAppearance = useSettingsStore((state) => state.setAppearance);
  const defaultLabel = useModelsStore((state) =>
    defaultModel
      ? (state.models.find((model) => sameModelRef(model.ref, defaultModel))?.label ?? null)
      : null,
  );
  const [sheetOpen, setSheetOpen] = useState(false);

  function handleSelectDefault(model: ModelInfo) {
    if (!providerId) return;
    setDefaultModel(providerId, model.ref);
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="px-4 pt-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <GroupLabel>Server</GroupLabel>
        <ConnectionCard />

        {capabilities?.modelSelection === true ? (
          <>
            <GroupLabel>Chat</GroupLabel>
            <Group>
              <Row
                icon="cube-outline"
                title="Default model"
                subtitle="For new chats"
                value={defaultLabel ?? defaultModel?.id ?? "Choose"}
                chevron
                accessibilityLabel="Choose default model"
                onPress={() => setSheetOpen(true)}
                testID="default-model-button"
              />
            </Group>
          </>
        ) : null}

        <GroupLabel>Appearance</GroupLabel>
        <View className="flex-row rounded-[20px] bg-surface p-1" accessibilityRole="radiogroup">
          {APPEARANCES.map((option) => {
            const active = option.value === appearance;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                accessibilityState={{ checked: active }}
                className={cn(
                  "h-10 flex-1 items-center justify-center rounded-2xl",
                  active ? "bg-elevated" : "active:bg-surface-hover",
                )}
                onPress={() => setAppearance(option.value)}
                testID={`appearance-${option.value}`}
              >
                <Text
                  className={cn(
                    "text-[15px]",
                    active ? "font-medium text-text" : "text-text-muted",
                  )}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <GroupLabel>About</GroupLabel>
        <Group>
          <Row
            icon="information-outline"
            title="Version"
            value={Constants.expoConfig?.version ?? "—"}
          />
          <Row
            icon="palette-outline"
            title="Design primitives"
            subtitle="Developer preview of the UI building blocks"
            chevron
            onPress={() => router.push("/ui-demo")}
          />
        </Group>
      </ScrollView>
      {capabilities?.modelSelection === true ? (
        <ModelSheet
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
          selected={defaultModel ?? null}
          onSelect={handleSelectDefault}
          subtitle="Default for new chats"
        />
      ) : null}
    </View>
  );
}
