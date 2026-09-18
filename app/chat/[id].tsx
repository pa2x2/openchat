import { View, KeyboardAvoidingView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useColorScheme } from "nativewind";
import { themes } from "@/src/ui/theme";
import { Bubble } from "@/src/ui";

/**
 * Conversation screen (placeholder).
 *
 * Shows a static sample bubble for the routed chat id; the streaming
 * state machine and the real message list are not wired up yet.
 */
export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme ?? "light";

  return (
    <View style={themes[scheme]} className="flex-1 bg-background">
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <View className="flex-1 justify-center px-4">
          <Bubble role="assistant" text={`Chat ${id ?? "?"} — streaming not connected yet.`} />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
