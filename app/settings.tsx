import Constants from "expo-constants";
import { ScrollView, View } from "react-native";
import { Text } from "@/src/ui/Text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ConnectionCard } from "@/src/features/connection/ConnectionCard";
import { updatesSupported } from "@/src/features/updates/installer";
import { formatTimestamp } from "@/src/lib/time";
import {
  useSettingsStore,
  type Appearance,
  type ColorSource,
  type ChatMode,
  type UpdateChannel,
} from "@/src/stores/settings";
import { useUpdatesStore, type UpdateStatus } from "@/src/stores/updates";
import { playHaptic } from "@/src/ui/haptics";
import { Group, GroupLabel, Row } from "@/src/ui/ListGroup";
import { Segmented } from "@/src/ui/Segmented";
import { Spinner } from "@/src/ui/Spinner";
import { Switch } from "@/src/ui/Switch";
import { dynamicColorsSupported } from "@/src/ui/systemPalettes";

const APPEARANCES: { value: Appearance; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const COLOR_SOURCES: { value: ColorSource; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "dynamic", label: "Dynamic" },
];

const CHAT_MODES: { value: ChatMode; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "temporary", label: "Temporary" },
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

function UpdatesSection() {
  const channel = useSettingsStore((state) => state.updateChannel);
  const setChannel = useSettingsStore((state) => state.setUpdateChannel);
  const checkOnStartup = useSettingsStore((state) => state.checkUpdatesOnStartup);
  const setCheckOnStartup = useSettingsStore((state) => state.setCheckUpdatesOnStartup);
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
      <Group className="mt-2">
        <Row
          icon="update"
          title={release && status !== "upToDate" ? "Update available" : "Check for updates"}
          subtitle={subtitle}
          trailing={status === "checking" ? <Spinner size="small" /> : undefined}
          chevron={release !== null}
          onPress={() => (release ? openSheet() : void check())}
          testID="check-updates"
        />
        <Row
          icon="autorenew"
          title="Check for updates on startup"
          onPress={() => setCheckOnStartup(!checkOnStartup)}
          trailing={
            <Switch
              value={checkOnStartup}
              onValueChange={setCheckOnStartup}
              accessibilityLabel="Check for updates on startup"
              testID="check-updates-on-startup-switch"
            />
          }
          testID="check-updates-on-startup"
        />
      </Group>
    </>
  );
}

function HapticsRow() {
  const haptics = useSettingsStore((state) => state.haptics);
  const setHaptics = useSettingsStore((state) => state.setHaptics);

  function handleChange(next: boolean) {
    setHaptics(next);
    // Played after the change, so switching on is felt and switching off is not.
    playHaptic("toggle-on");
  }

  return (
    <Row
      icon="vibrate"
      title="Haptic feedback"
      onPress={() => handleChange(!haptics)}
      trailing={
        <Switch
          value={haptics}
          onValueChange={handleChange}
          accessibilityLabel="Haptic feedback"
          testID="haptics-switch"
        />
      }
      testID="haptics"
    />
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const appearance = useSettingsStore((state) => state.appearance);
  const setAppearance = useSettingsStore((state) => state.setAppearance);
  const colorSource = useSettingsStore((state) => state.colorSource);
  const setColorSource = useSettingsStore((state) => state.setColorSource);
  const defaultChatMode = useSettingsStore((state) => state.defaultChatMode);
  const setDefaultChatMode = useSettingsStore((state) => state.setDefaultChatMode);

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="px-4 pt-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <GroupLabel>Server</GroupLabel>
        <ConnectionCard />

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

        <GroupLabel>Default chat mode</GroupLabel>
        <Segmented
          options={CHAT_MODES}
          value={defaultChatMode}
          onChange={setDefaultChatMode}
          testIDPrefix="default-chat-mode"
        />

        <GroupLabel>Interaction</GroupLabel>
        <Group>
          <HapticsRow />
        </Group>

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
    </View>
  );
}
