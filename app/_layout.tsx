import "../global.css";

import { useEffect } from "react";
import { View } from "react-native";
import { Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { colorScheme } from "nativewind";
import { useSettingsStore } from "@/src/stores/settings";
import { useAppTheme } from "@/src/ui/theme";

export default function RootLayout() {
  const { scheme, vars, navigationTheme } = useAppTheme();
  const appearance = useSettingsStore((state) => state.appearance);

  // The saved preference drives the scheme; "system" follows the device.
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
              the bar's background is whatever screen is behind it. */}
          <StatusBar style={scheme === "dark" ? "light" : "dark"} />
          <Stack screenOptions={{ headerShadowVisible: false }}>
            <Stack.Screen name="(main)" options={{ headerShown: false }} />
            <Stack.Screen name="settings" options={{ title: "Settings" }} />
            <Stack.Screen name="ui-demo" options={{ title: "Design primitives" }} />
          </Stack>
        </View>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
