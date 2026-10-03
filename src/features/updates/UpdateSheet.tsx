/**
 * Update prompt: what the new version brings, then download and install
 * progress, in a bottom sheet over whatever screen is open. Opened by the
 * launch check or from Settings; all state lives in the updates store.
 */

import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Linking, ScrollView, View } from "react-native";
import { Text } from "@/src/ui/Text";
import { MarkdownContent } from "@/src/features/markdown/MarkdownContent";
import { formatNumber } from "@/src/i18n/format";
import { useUpdatesStore } from "@/src/stores/updates";
import { Button } from "@/src/ui/Button";
import { LinearProgress } from "@/src/ui/LinearProgress";
import { Sheet } from "@/src/ui/Sheet";

export function formatSize(t: TFunction, bytes: number): string {
  return t("format.megabytes", { value: formatNumber(t, bytes / (1024 * 1024), 1) });
}

function ProgressBar({ progress }: { progress: number | null }) {
  const { t } = useTranslation();
  return (
    <View className="gap-2" testID="update-progress">
      <LinearProgress progress={progress} immediate className="h-1.5" />
      <Text className="text-sm text-text-muted">
        {progress === null
          ? t("settings.updates.downloading")
          : t("settings.updates.downloadingPercent", { percent: Math.round(progress * 100) })}
      </Text>
    </View>
  );
}

export function UpdateSheet() {
  const { t } = useTranslation();
  const sheetOpen = useUpdatesStore((state) => state.sheetOpen);
  const release = useUpdatesStore((state) => state.release);
  const status = useUpdatesStore((state) => state.status);
  const progress = useUpdatesStore((state) => state.progress);
  const error = useUpdatesStore((state) => state.error);
  const closeSheet = useUpdatesStore((state) => state.closeSheet);
  const startUpdate = useUpdatesStore((state) => state.startUpdate);
  const cancelDownload = useUpdatesStore((state) => state.cancelDownload);
  const requestInstallPermission = useUpdatesStore((state) => state.requestInstallPermission);

  const subtitle = release
    ? [
        t("updates.version", { version: release.version }),
        formatSize(t, release.apk.size),
        release.prerelease ? t("settings.updates.channel.prerelease") : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : undefined;

  return (
    <Sheet
      visible={sheetOpen && release !== null}
      onClose={closeSheet}
      title={t("settings.updates.updateAvailable")}
      subtitle={subtitle}
      testID="update-sheet"
    >
      {release?.notes ? (
        <ScrollView
          style={{ flexGrow: 0, maxHeight: 320 }}
          className="mb-3 rounded-[20px] bg-raised"
        >
          {/* Holds the touch so the sheet's drag-to-dismiss never gets it,
              not even on a downward drag: on Android the view holding the JS
              responder intercepts native moves, so the card would stop this
              ScrollView from scrolling on any slow drag. */}
          <View
            className="px-4 py-2"
            onStartShouldSetResponder={() => true}
            onResponderTerminationRequest={() => false}
          >
            <MarkdownContent
              text={release.notes}
              role="assistant"
              streaming={false}
              backdrop="raised"
            />
          </View>
        </ScrollView>
      ) : null}

      <View className="gap-3 px-1">
        {status === "downloading" ? <ProgressBar progress={progress} /> : null}
        {status === "installing" ? (
          <Text className="text-sm text-text-muted">{t("updates.installingNote")}</Text>
        ) : null}
        {status === "needsPermission" ? (
          <Text className="text-sm leading-5 text-text-muted" testID="update-permission">
            {t("updates.permissionNote")}
          </Text>
        ) : null}
        {status === "error" && error ? (
          <Text className="text-sm leading-5 text-danger" testID="update-error">
            {error}
          </Text>
        ) : null}

        {status === "downloading" ? (
          <Button
            label={t("updates.cancelDownload")}
            variant="secondary"
            onPress={cancelDownload}
            testID="update-cancel"
          />
        ) : status === "installing" ? (
          <Button label={t("updates.installing")} loading testID="update-installing" />
        ) : status === "needsPermission" ? (
          <Button
            label={t("updates.allowInstalls")}
            onPress={requestInstallPermission}
            testID="update-allow"
          />
        ) : (
          <Button
            label={status === "error" ? t("common.tryAgain") : t("updates.updateNow")}
            onPress={() => void startUpdate()}
            testID="update-start"
          />
        )}
        {status === "error" && release ? (
          <Button
            label={t("updates.openReleasePage")}
            variant="ghost"
            onPress={() => void Linking.openURL(release.pageUrl)}
            testID="update-release-page"
          />
        ) : null}
        {status === "available" || status === "error" || status === "needsPermission" ? (
          <Button
            label={t("updates.notNow")}
            variant="ghost"
            onPress={closeSheet}
            testID="update-later"
          />
        ) : null}
      </View>
    </Sheet>
  );
}
