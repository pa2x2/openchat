import { Link, Stack } from "expo-router";
import { Pressable, Text, View, FlatList } from "react-native";
import { Button } from "@/src/ui/Button";
import { themes } from "@/src/ui/theme";
import { useColorScheme } from "nativewind";

/**
 * Chat list screen (placeholder).
 *
 * Not connected to a backend yet: renders the empty state, entry points
 * to the settings/demo screens, and a static sample of the chat-list
 * row shape. Will be driven by the chats store once chat data exists.
 */
const SAMPLE_ROWS = [{ id: "demo-1", title: "Sample conversation", updatedAt: "Sep 18, 2026" }];

export default function ChatListScreen() {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme ?? "light";

  return (
    <View style={themes[scheme]} className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: "OpenChat",
          headerTintColor: "rgb(var(--oc-text))",
          headerRight: () => (
            <Button
              label="New chat"
              size="sm"
              variant="ghost"
              onPress={() => {
                /* not wired up yet */
              }}
            />
          ),
        }}
      />
      <FlatList
        data={SAMPLE_ROWS}
        keyExtractor={(item) => item.id}
        contentContainerClassName="p-3 gap-2"
        renderItem={({ item }) => (
          <Pressable className="rounded-xl border border-border bg-surface p-4 active:bg-surface-hover">
            <Text className="text-base font-semibold text-text" numberOfLines={1}>
              {item.title}
            </Text>
            <Text className="mt-1 text-sm text-text-muted">{item.updatedAt}</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <View className="items-center justify-center pt-24">
            <Text className="text-lg font-semibold text-text">No chats yet</Text>
            <Text className="mt-2 px-8 text-center text-sm text-text-muted">
              Start a conversation with your self-hosted server.
            </Text>
          </View>
        }
        ListFooterComponent={
          <Link href="/settings" asChild className="mt-2">
            <Pressable className="items-center p-3">
              <Text className="text-base text-primary">Open settings</Text>
            </Pressable>
          </Link>
        }
      />
    </View>
  );
}
