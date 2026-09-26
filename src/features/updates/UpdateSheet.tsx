/**
 * Update prompt: what the new version brings, then download and install
 * progress, in a bottom sheet over whatever screen is open. Opened by the
 * launch check or from Settings; all state lives in the updates store.
 */

import { Linking, ScrollView, Text, View } from "react-native";
import { MarkdownContent } from "@/src/features/markdown/MarkdownContent";
import { useUpdatesStore } from "@/src/stores/updates";
import { Button } from "@/src/ui/Button";
import { Sheet } from "@/src/ui/Sheet";

export function formatSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ProgressBar({ progress }: { progress: number | null }) {
  return (
    <View className="gap-2" testID="update-progress">
      <View className="h-1.5 overflow-hidden rounded-full bg-border">
        <View
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
        />
      </View>
      <Text className="text-sm text-text-muted">
        {progress === null ? "Downloading…" : `Downloading… ${Math.round(progress * 100)}%`}
      </Text>
    </View>
  );
}

export function UpdateSheet() {
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
        `Version ${release.version}`,
        formatSize(release.apk.size),
        release.prerelease ? "Pre-release" : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : undefined;

  return (
    <Sheet
      visible={sheetOpen && release !== null}
      onClose={closeSheet}
      title="Update available"
      subtitle={subtitle}
      testID="update-sheet"
    >
      {release?.notes ? (
        <ScrollView
          style={{ flexGrow: 0, maxHeight: 320 }}
          className="mb-3 rounded-[20px] bg-raised"
        >
          <View className="px-4 py-2">
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
          <Text className="text-sm text-text-muted">
            {
              "Installing… OpenChat closes to finish the update. Open it again to use the new version."
            }
          </Text>
        ) : null}
        {status === "needsPermission" ? (
          <Text className="text-sm leading-5 text-text-muted" testID="update-permission">
            {
              "Android needs your permission for OpenChat to install updates. Turn on “Allow from this source”, then come back. You only need to do this once."
            }
          </Text>
        ) : null}
        {status === "error" && error ? (
          <Text className="text-sm leading-5 text-danger" testID="update-error">
            {error}
          </Text>
        ) : null}

        {status === "downloading" ? (
          <Button
            label="Cancel download"
            variant="secondary"
            onPress={cancelDownload}
            testID="update-cancel"
          />
        ) : status === "installing" ? (
          <Button label="Installing…" disabled testID="update-installing" />
        ) : status === "needsPermission" ? (
          <Button label="Allow installs" onPress={requestInstallPermission} testID="update-allow" />
        ) : (
          <Button
            label={status === "error" ? "Try again" : "Update now"}
            onPress={() => void startUpdate()}
            testID="update-start"
          />
        )}
        {status === "error" && release ? (
          <Button
            label="Open release page"
            variant="ghost"
            onPress={() => void Linking.openURL(release.pageUrl)}
            testID="update-release-page"
          />
        ) : null}
        {status === "available" || status === "error" || status === "needsPermission" ? (
          <Button label="Not now" variant="ghost" onPress={closeSheet} testID="update-later" />
        ) : null}
      </View>
    </Sheet>
  );
}
