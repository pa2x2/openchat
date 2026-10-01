import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Text } from "@/src/ui/Text";
import { Button } from "@/src/ui/Button";

export function EmptyChat({
  connected,
  temporary,
  onOpenSettings,
}: {
  connected: boolean;
  temporary: boolean;
  onOpenSettings: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="flex-1 items-center justify-center px-8 pb-10" testID="empty-chat">
      {connected && temporary ? (
        <>
          <Text className="text-center text-[22px] font-medium text-text">
            {t("chat.temporary")}
          </Text>
          <Text className="mt-1.5 text-center text-[15px] leading-[22px] text-text-muted">
            {t("chat.empty.temporaryHint")}
          </Text>
        </>
      ) : connected ? (
        <Text className="text-center text-[26px] font-medium text-text">
          {t("chat.empty.greeting")}
        </Text>
      ) : (
        <>
          <Text className="text-center text-[26px] font-medium text-text">
            {t("chat.empty.connectTitle")}
          </Text>
          <Text className="mb-6 mt-2 text-center text-[15px] leading-[22px] text-text-muted">
            {t("chat.empty.connectHint")}
          </Text>
          <Button
            label={t("chat.empty.openSettings")}
            onPress={onOpenSettings}
            testID="empty-open-settings"
          />
        </>
      )}
    </View>
  );
}
