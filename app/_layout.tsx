import "../global.css";

import { View } from "react-native";
import { Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useAppTheme } from "@/src/ui/theme";

export default function RootLayout() {
  const { scheme, vars, navigationTheme } = useAppTheme();

  return (
    // `ThemeProvider` is what themes the navigation chrome: expo-router mounts
    // its NavigationContainer with no theme, so headers and the tab bar would
    // otherwise stay on the light defaults. `vars` on this View is the other
    // half — it seeds the CSS variables every NativeWind class reads. Both are
    // set once, here, and inherited by every screen below.
    <ThemeProvider value={navigationTheme}>
      <View style={vars} className="flex-1 bg-background">
        {/* Only the icon tint is ours to set: the bar's background is painted
            by the navigation theme's `card` on Android and the system on iOS. */}
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="chat/[id]" options={{ title: "Chat" }} />
          <Stack.Screen name="settings" options={{ title: "Settings" }} />
          <Stack.Screen name="ui-demo" options={{ title: "Design primitives" }} />
        </Stack>
      </View>
    </ThemeProvider>
  );
}
