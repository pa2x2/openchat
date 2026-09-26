import { Text, View } from "react-native";
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
  return (
    <View className="flex-1 items-center justify-center px-8 pb-10" testID="empty-chat">
      {connected && temporary ? (
        <>
          <Text className="text-center text-[22px] font-medium text-text">Temporary chat</Text>
          <Text className="mt-1.5 text-center text-[15px] leading-[22px] text-text-muted">
            This chat won’t appear in history and is deleted when you leave it.
          </Text>
        </>
      ) : connected ? (
        <Text className="text-center text-[26px] font-medium text-text">What can I help with?</Text>
      ) : (
        <>
          <Text className="text-center text-[26px] font-medium text-text">Connect a server</Text>
          <Text className="mb-6 mt-2 text-center text-[15px] leading-[22px] text-text-muted">
            OpenChat talks to your own OpenCode server. Add its address to start chatting.
          </Text>
          <Button label="Open settings" onPress={onOpenSettings} testID="empty-open-settings" />
        </>
      )}
    </View>
  );
}
