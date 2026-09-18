import { Stack } from "expo-router";
import { View, Text } from "react-native";
import { useColorScheme } from "nativewind";
import { themes } from "@/src/ui/theme";

export default function NotFoundScreen() {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme ?? "light";

  return (
    <>
      <Stack.Screen options={{ title: "Not found" }} />
      <View style={themes[scheme]} className="flex-1 items-center justify-center bg-background">
        <Text className="text-lg font-semibold text-text">Screen not found</Text>
      </View>
    </>
  );
}
