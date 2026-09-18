import "../global.css";

import { View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "nativewind";
import { themes } from "@/src/ui/theme";

export default function RootLayout() {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme ?? "light";

  return (
    <View style={themes[scheme]} className="flex-1 bg-background">
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="chat/[id]"
          options={{ title: "Chat", headerTintColor: "rgb(var(--oc-text))" }}
        />
        <Stack.Screen
          name="settings"
          options={{ title: "Settings", headerTintColor: "rgb(var(--oc-text))" }}
        />
        <Stack.Screen
          name="ui-demo"
          options={{ title: "Design primitives", headerTintColor: "rgb(var(--oc-text))" }}
        />
      </Stack>
    </View>
  );
}
