import { useEffect } from "react";
import { AppState } from "react-native";
import { useSettingsStore } from "@/src/stores/settings";
import { useUpdatesStore } from "@/src/stores/updates";
import { updatesSupported } from "./installer";

/**
 * Checks for an update on launch, unless the setting is off. Development
 * builds skip it too; Settings can still check.
 *
 * Coming back to the app is how an install that waited for the "install
 * unknown apps" permission continues.
 */
export function useUpdateChecks() {
  useEffect(() => {
    if (!updatesSupported) return;
    if (!__DEV__ && useSettingsStore.getState().checkUpdatesOnStartup) {
      void useUpdatesStore.getState().check({ auto: true });
    }

    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      const store = useUpdatesStore.getState();
      if (store.status === "needsPermission") void store.resumeInstall();
    });
    return () => subscription.remove();
  }, []);
}
