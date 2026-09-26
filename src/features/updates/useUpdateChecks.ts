import { useEffect } from "react";
import { AppState } from "react-native";
import { useUpdatesStore } from "@/src/stores/updates";
import { updatesSupported } from "./installer";

/**
 * Background update checks: on launch and whenever the app comes back to the
 * front (the store throttles them). Coming back is also how an install that
 * waited for the "install unknown apps" permission continues.
 *
 * Development builds skip the automatic checks; Settings can still check.
 */
export function useUpdateChecks() {
  useEffect(() => {
    if (!updatesSupported) return;
    const { check } = useUpdatesStore.getState();
    if (!__DEV__) void check({ auto: true });

    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      const store = useUpdatesStore.getState();
      if (store.status === "needsPermission") void store.resumeInstall();
      else if (!__DEV__) void store.check({ auto: true });
    });
    return () => subscription.remove();
  }, []);
}
