import { Stack } from "expo-router";
import { View, Text } from "react-native";
export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Not found" }} />
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-lg font-semibold text-text">Screen not found</Text>
      </View>
    </>
  );
}
