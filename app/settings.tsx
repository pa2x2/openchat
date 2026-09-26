import Constants from "expo-constants";
import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ConnectionCard } from "@/src/features/connection/ConnectionCard";
import { ModelSheet } from "@/src/features/chat/ModelSheet";
import { updatesSupported } from "@/src/features/updates/installer";
import { formatTimestamp } from "@/src/lib/time";
import { useProviderCapabilities } from "@/src/lib/providerFactory";
import { sameModelRef, useModelsStore } from "@/src/stores/models";
import {
  useSettingsStore,
  type Appearance,
  type ColorSource,
  type UpdateChannel,
} from "@/src/stores/settings";
import { useConnectionStore } from "@/src/stores/connection";
import { useUpdatesStore, type UpdateStatus } from "@/src/stores/updates";
import { Group, GroupLabel, Row } from "@/src/ui/ListGroup";
import { Segmented } from "@/src/ui/Segmented";
import { dynamicColorsSupported } from "@/src/ui/systemPalettes";
import type { ModelInfo } from "@/src/domain";

const APPEARANCES: { value: Appearance; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const COLOR_SOURCES: { value: ColorSource; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "dynamic", label: "Dynamic" },
];

const CHANNELS: { value: UpdateChannel; label: string }[] = [
  { value: "stable", label: "Stable" },
  { value: "prerelease", label: "Pre-release" },
];

function updateStatusLine(
  status: UpdateStatus,
  version: string | undefined,
  progress: number | null,
  error: string | null,
  lastCheckedAt: number | null,
): string | undefined {
  switch (status) {
    case "checking":
      return "Checking…";
    case "upToDate":
      return "You're on the latest version";
    case "downloading":
      return progress === null ? "Downloading…" : `Downloading… ${Math.round(progress * 100)}%`;
    case "needsPermission":
      return "Waiting for permission to install";
    case "installing":
      return "Installing…";
    case "error":
      return error ?? "The update failed";
    default:
      if (version) return `Version ${version} is available`;
      return lastCheckedAt !== null ? `Last checked ${formatTimestamp(lastCheckedAt)}` : undefined;
  }
}

/** Settings rows for in-app updates: the channel and a check/status row. */
function UpdatesSection() {
  const channel = useSettingsStore((state) => state.updateChannel);
  const setChannel = useSettingsStore((state) => state.setUpdateChannel);
  const status = useUpdatesStore((state) => state.status);
  const release = useUpdatesStore((state) => state.release);
  const progress = useUpdatesStore((state) => state.progress);
  const error = useUpdatesStore((state) => state.error);
  const lastCheckedAt = useUpdatesStore((state) => state.lastCheckedAt);
  const check = useUpdatesStore((state) => state.check);
  const openSheet = useUpdatesStore((state) => state.openSheet);

  const subtitle = updateStatusLine(status, release?.version, progress, error, lastCheckedAt);

  function handleChannel(next: UpdateChannel) {
    if (next === channel) return;
    setChannel(next);
    void check();
  }

  return (
    <>
      <GroupLabel>Updates</GroupLabel>
      <Segmented
        options={CHANNELS}
        value={channel}
        onChange={handleChannel}
        testIDPrefix="update-channel"
      />
      <Text className="px-3 pb-3 pt-2 text-[13px] leading-[18px] text-text-muted">
        {channel === "prerelease"
          ? "Get new versions early. Pre-releases can be less stable."
          : "Only get versions that are marked stable."}
      </Text>
      <Group>
        <Row
          icon="update"
          title={release && status !== "upToDate" ? "Update available" : "Check for updates"}
          subtitle={subtitle}
          trailing={status === "checking" ? <ActivityIndicator size="small" /> : undefined}
          chevron={release !== null}
          onPress={() => (release ? openSheet() : void check())}
          testID="check-updates"
        />
      </Group>
    </>
  );
}

/**
 * Settings screen: the server connection, chat defaults, appearance and
 * colours, updates, and app info, as grouped lists.
 */
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const capabilities = useProviderCapabilities();
  const providerId = useConnectionStore((state) => state.profile?.providerId);
  const defaultModel = useSettingsStore((state) =>
    providerId ? state.defaultModels[providerId] : undefined,
  );
  const setDefaultModel = useSettingsStore((state) => state.setDefaultModel);
  const appearance = useSettingsStore((state) => state.appearance);
  const setAppearance = useSettingsStore((state) => state.setAppearance);
  const colorSource = useSettingsStore((state) => state.colorSource);
  const setColorSource = useSettingsStore((state) => state.setColorSource);
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
        <Segmented
          options={APPEARANCES}
          value={appearance}
          onChange={setAppearance}
          testIDPrefix="appearance"
        />

        {/* Material You needs Android 12+; elsewhere there is only one choice. */}
        {dynamicColorsSupported ? (
          <>
            <GroupLabel>Colors</GroupLabel>
            <Segmented
              options={COLOR_SOURCES}
              value={colorSource}
              onChange={setColorSource}
              testIDPrefix="colors"
            />
          </>
        ) : null}

        {updatesSupported ? <UpdatesSection /> : null}

        <GroupLabel>About</GroupLabel>
        <Group>
          <Row
            icon="information-outline"
            title="Version"
            value={Constants.expoConfig?.version ?? "—"}
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
