import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Text } from "@/src/ui/Text";
export default function NotFoundScreen() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: t("notFound.title") }} />
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-lg font-semibold text-text">{t("notFound.message")}</Text>
      </View>
    </>
  );
}
