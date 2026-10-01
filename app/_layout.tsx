import "../global.css";
import { applyLanguage } from "@/src/i18n";

import { useEffect } from "react";
import { Platform, View } from "react-native";
import { requireNativeModule } from "expo";
import { Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useLocales } from "expo-localization";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useTranslation } from "react-i18next";
import { colorScheme } from "nativewind";
import { watchTurns } from "@/src/features/notifications/turnNotifications";
import { UpdateSheet } from "@/src/features/updates/UpdateSheet";
import { useUpdateChecks } from "@/src/features/updates/useUpdateChecks";
import { useSettingsStore } from "@/src/stores/settings";
import { DialogHost } from "@/src/ui/Dialog";
import { useSystemPalettesSync } from "@/src/ui/systemPalettes";
import { useAppTheme } from "@/src/ui/theme";

// Called directly rather than through expo-navigation-bar's <NavigationBar>.
// That component, on unmount (Back finishing the activity while JS lives on),
// calls the native `setHidden` with nobody catching the rejection once the
// activity is gone. It also caches the last style in JS, so the activity
// created on the next launch never got the in-app scheme's style.
const ExpoNavigationBar =
  Platform.OS === "android"
    ? requireNativeModule<{ setStyle(style: "light" | "dark"): Promise<void> }>("ExpoNavigationBar")
    : null;

// Applied before the first render as well as on change: from the effect
// alone, a launch with a forced scheme would draw its first frame in the
// system one.
colorScheme.set(useSettingsStore.getState().appearance);
applyLanguage(useSettingsStore.getState().language);

export default function RootLayout() {
  const { scheme, vars, navigationTheme } = useAppTheme();
  const appearance = useSettingsStore((state) => state.appearance);
  const language = useSettingsStore((state) => state.language);
  // Changes when the device's languages do, which matters on "system".
  const locales = useLocales();
  const { t } = useTranslation();
  useUpdateChecks();
  useSystemPalettesSync();

  useEffect(watchTurns, []);

  useEffect(() => {
    colorScheme.set(appearance);
  }, [appearance]);

  useEffect(() => {
    applyLanguage(language);
  }, [language, locales]);

  useEffect(() => {
    // Rejects if the activity is already gone; the next one reapplies this.
    ExpoNavigationBar?.setStyle(scheme === "dark" ? "light" : "dark").catch(() => {});
  }, [scheme]);

  return (
    // `ThemeProvider` is what themes the navigation chrome: expo-router mounts
    // its NavigationContainer with no theme, so headers would otherwise stay
    // on the light defaults. `vars` on this View is the other half — it seeds
    // the CSS variables every NativeWind class reads. Both are set once, here,
    // and inherited by every screen below.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={navigationTheme}>
        <View style={vars} className="flex-1 bg-background">
          {/* Only the icon tint is ours to set: the app draws edge-to-edge, so
              the bars' background is whatever screen is behind them (the nav
              bar's contrast scrim is off in app.json). Both bars need it set
              (the nav bar in the effect above): natively they follow the
              system scheme, not the in-app one. */}
          <StatusBar style={scheme === "dark" ? "light" : "dark"} />
          <Stack screenOptions={{ headerShadowVisible: false }}>
            <Stack.Screen name="(main)" options={{ headerShown: false }} />
            <Stack.Screen name="settings" options={{ title: t("settings.title") }} />
            <Stack.Screen name="usage" options={{ title: t("usage.title") }} />
          </Stack>
          {/* Here rather than in a screen, so a launch check can offer an
              update over whichever screen is open. */}
          <UpdateSheet />
          <DialogHost />
        </View>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
