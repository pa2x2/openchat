import "../global.css";

import { useEffect } from "react";
import { View } from "react-native";
import { Stack, ThemeProvider } from "expo-router";
import { NavigationBar } from "expo-navigation-bar";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { colorScheme } from "nativewind";
import { UpdateSheet } from "@/src/features/updates/UpdateSheet";
import { useUpdateChecks } from "@/src/features/updates/useUpdateChecks";
import { useSettingsStore } from "@/src/stores/settings";
import { DialogHost } from "@/src/ui/Dialog";
import { useSystemPalettesSync } from "@/src/ui/systemPalettes";
import { useAppTheme } from "@/src/ui/theme";

// Applied before the first render as well as on change: from the effect
// alone, a launch with a forced scheme would draw its first frame in the
// system one.
colorScheme.set(useSettingsStore.getState().appearance);

export default function RootLayout() {
  const { scheme, vars, navigationTheme } = useAppTheme();
  const appearance = useSettingsStore((state) => state.appearance);
  useUpdateChecks();
  useSystemPalettesSync();

  useEffect(() => {
    colorScheme.set(appearance);
  }, [appearance]);

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
              bar's contrast scrim is off in app.json). Both need setting here:
              natively they follow the system scheme, not the in-app one. */}
          <StatusBar style={scheme === "dark" ? "light" : "dark"} />
          <NavigationBar style={scheme === "dark" ? "light" : "dark"} />
          <Stack screenOptions={{ headerShadowVisible: false }}>
            <Stack.Screen name="(main)" options={{ headerShown: false }} />
            <Stack.Screen name="settings" options={{ title: "Settings" }} />
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
