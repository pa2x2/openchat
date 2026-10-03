import Constants from "expo-constants";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ConnectionCard } from "@/src/features/connection/ConnectionCard";
import { updatesSupported } from "@/src/features/updates/installer";
import { LANGUAGE_NAMES, type Language, type LanguageSetting } from "@/src/i18n";
import { formatTimestamp } from "@/src/lib/time";
import {
  useSettingsStore,
  type Appearance,
  type ColorSource,
  type ChatControls,
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

const APPEARANCES: Appearance[] = ["system", "light", "dark"];
const COLOR_SOURCES: ColorSource[] = ["default", "dynamic"];
const CHAT_MODES: ChatMode[] = ["normal", "temporary"];
const CHAT_CONTROLS: ChatControls[] = ["bottom", "top"];
const CHANNELS: UpdateChannel[] = ["stable", "prerelease"];

function languageOptions(t: TFunction): { value: LanguageSetting; label: string }[] {
  return [
    { value: "system", label: t("settings.language.system") },
    ...Object.entries(LANGUAGE_NAMES).map(([value, label]) => ({
      value: value as Language,
      label,
    })),
  ];
}

function updateStatusLine(
  t: TFunction,
  status: UpdateStatus,
  version: string | undefined,
  progress: number | null,
  error: string | null,
  lastCheckedAt: number | null,
): string | undefined {
  switch (status) {
    case "checking":
      return t("settings.updates.checking");
    case "upToDate":
      return t("settings.updates.upToDate");
    case "downloading":
      return progress === null
        ? t("settings.updates.downloading")
        : t("settings.updates.downloadingPercent", { percent: Math.round(progress * 100) });
    case "needsPermission":
      return t("settings.updates.needsPermission");
    case "installing":
      return t("settings.updates.installing");
    case "error":
      return error ?? t("settings.updates.failed");
    default:
      if (version) return t("settings.updates.available", { version });
      return lastCheckedAt !== null
        ? t("settings.updates.lastChecked", { time: formatTimestamp(t, lastCheckedAt) })
        : undefined;
  }
}

function UpdatesSection() {
  const { t } = useTranslation();
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

  const subtitle = updateStatusLine(t, status, release?.version, progress, error, lastCheckedAt);

  function handleChannel(next: UpdateChannel) {
    if (next === channel) return;
    setChannel(next);
    void check();
  }

  return (
    <>
      <GroupLabel>{t("settings.updates.label")}</GroupLabel>
      <Segmented
        options={CHANNELS.map((value) => ({
          value,
          label: t(`settings.updates.channel.${value}`),
        }))}
        value={channel}
        onChange={handleChannel}
        testIDPrefix="update-channel"
      />
      <Group className="mt-2">
        <Row
          icon="update"
          title={
            release && status !== "upToDate"
              ? t("settings.updates.updateAvailable")
              : t("settings.updates.check")
          }
          subtitle={subtitle}
          trailing={status === "checking" ? <Spinner size="small" /> : undefined}
          chevron={release !== null}
          onPress={() => (release ? openSheet() : void check())}
          testID="check-updates"
        />
        <Row
          icon="autorenew"
          title={t("settings.updates.checkOnStartup")}
          onPress={() => setCheckOnStartup(!checkOnStartup)}
          trailing={
            <Switch
              value={checkOnStartup}
              onValueChange={setCheckOnStartup}
              accessibilityLabel={t("settings.updates.checkOnStartup")}
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
  const { t } = useTranslation();
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
      title={t("settings.haptics")}
      onPress={() => handleChange(!haptics)}
      trailing={
        <Switch
          value={haptics}
          onValueChange={handleChange}
          accessibilityLabel={t("settings.haptics")}
          testID="haptics-switch"
        />
      }
      testID="haptics"
    />
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const language = useSettingsStore((state) => state.language);
  const setLanguage = useSettingsStore((state) => state.setLanguage);
  const appearance = useSettingsStore((state) => state.appearance);
  const setAppearance = useSettingsStore((state) => state.setAppearance);
  const colorSource = useSettingsStore((state) => state.colorSource);
  const setColorSource = useSettingsStore((state) => state.setColorSource);
  const defaultChatMode = useSettingsStore((state) => state.defaultChatMode);
  const setDefaultChatMode = useSettingsStore((state) => state.setDefaultChatMode);
  const chatControls = useSettingsStore((state) => state.chatControls);
  const setChatControls = useSettingsStore((state) => state.setChatControls);

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="px-4 pt-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <GroupLabel>{t("settings.server")}</GroupLabel>
        <ConnectionCard />

        <GroupLabel>{t("settings.language.label")}</GroupLabel>
        <Segmented
          options={languageOptions(t)}
          value={language}
          onChange={setLanguage}
          testIDPrefix="language"
        />

        <GroupLabel>{t("settings.appearance.label")}</GroupLabel>
        <Segmented
          options={APPEARANCES.map((value) => ({
            value,
            label: t(`settings.appearance.${value}`),
          }))}
          value={appearance}
          onChange={setAppearance}
          testIDPrefix="appearance"
        />

        {/* Material You needs Android 12+; elsewhere there is only one choice. */}
        {dynamicColorsSupported ? (
          <>
            <GroupLabel>{t("settings.colors.label")}</GroupLabel>
            <Segmented
              options={COLOR_SOURCES.map((value) => ({
                value,
                label: t(`settings.colors.${value}`),
              }))}
              value={colorSource}
              onChange={setColorSource}
              testIDPrefix="colors"
            />
          </>
        ) : null}

        <GroupLabel>{t("settings.chatMode.label")}</GroupLabel>
        <Segmented
          options={CHAT_MODES.map((value) => ({ value, label: t(`settings.chatMode.${value}`) }))}
          value={defaultChatMode}
          onChange={setDefaultChatMode}
          testIDPrefix="default-chat-mode"
        />

        <GroupLabel>{t("settings.chatControls.label")}</GroupLabel>
        <Segmented
          options={CHAT_CONTROLS.map((value) => ({
            value,
            label: t(`settings.chatControls.${value}`),
          }))}
          value={chatControls}
          onChange={setChatControls}
          testIDPrefix="chat-controls"
        />

        <GroupLabel>{t("settings.interaction")}</GroupLabel>
        <Group>
          <HapticsRow />
        </Group>

        {updatesSupported ? <UpdatesSection /> : null}

        <GroupLabel>{t("settings.about")}</GroupLabel>
        <Group>
          <Row
            icon="information-outline"
            title={t("settings.version")}
            value={Constants.expoConfig?.version ?? "—"}
          />
        </Group>
      </ScrollView>
    </View>
  );
}
