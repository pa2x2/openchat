import { Link } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { colorScheme as colorSchemeApi, useColorScheme } from "nativewind";
import { ConnectionCard } from "@/src/features/connection/ConnectionCard";
import { Button } from "@/src/ui/Button";
import { themes } from "@/src/ui/theme";

/**
 * Settings screen.
 *
 * Hosts the server connection form, the theme toggle and the
 * design-primitives demo entry point.
 */
export default function SettingsScreen() {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme ?? "light";

  const toggleScheme = () => {
    colorSchemeApi.set(scheme === "light" ? "dark" : "light");
  };

  return (
    <View style={themes[scheme]} className="flex-1 bg-background">
      <ScrollView contentContainerClassName="p-4 gap-4">
        <ConnectionCard />

        <View className="gap-3 rounded-xl border border-border bg-surface p-4">
          <Text className="text-base font-semibold text-text">Appearance</Text>
          <Text className="text-sm text-text-muted">Current scheme: {scheme}</Text>
          <Button
            label={`Switch to ${scheme === "light" ? "dark" : "light"}`}
            variant="secondary"
            onPress={toggleScheme}
          />
        </View>

        <Link href="/ui-demo" asChild>
          <Pressable className="rounded-xl border border-border bg-surface p-4 active:bg-surface-hover">
            <Text className="text-base font-semibold text-text">Design primitives demo</Text>
            <Text className="mt-1 text-sm text-text-muted">
              Button, Input, Sheet, Bubble in both schemes
            </Text>
          </Pressable>
        </Link>
      </ScrollView>
    </View>
  );
}
