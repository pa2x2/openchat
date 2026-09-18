import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Pressable, Text, View } from "react-native";
import { Link, Stack, useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import { themes } from "@/src/ui/theme";
import { getProvider, useProviderCapabilities } from "@/src/lib/providerFactory";
import { formatTimestamp } from "@/src/lib/time";
import { useChatsStore } from "@/src/stores/chats";
import { useMessagesStore } from "@/src/stores/messages";

/**
 * Chat list screen: every conversation the server knows about, newest
 * first, cached locally for instant launch. Tapping a row opens the
 * transcript; long-press deletes (when the provider supports it).
 */
export default function ChatListScreen() {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme ?? "light";
  const router = useRouter();
  const chats = useChatsStore((state) => state.chats);
  const refreshChats = useChatsStore((state) => state.refresh);
  const capabilities = useProviderCapabilities();
  const [refreshing, setRefreshing] = useState(false);

  // Startup: warm the provider from the persisted profile, then reconcile
  // the list against the server.
  useEffect(() => {
    void (async () => {
      await getProvider();
      await refreshChats();
    })();
  }, [refreshChats]);

  const onRefresh = useCallback(() => {
    void (async () => {
      setRefreshing(true);
      await refreshChats();
      setRefreshing(false);
    })();
  }, [refreshChats]);

  function confirmDelete(id: string, title: string) {
    Alert.alert("Delete chat", `Delete “${title || "this chat"}”?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            const provider = await getProvider();
            if (!provider) return;
            try {
              await provider.deleteChat(id);
            } finally {
              useChatsStore.getState().remove(id);
              useMessagesStore.getState().removeChat(id);
            }
          })();
        },
      },
    ]);
  }

  return (
    <View style={themes[scheme]} className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: "OpenChat",
          headerTintColor: "rgb(var(--oc-text))",
          headerRight: () => (
            <Pressable
              onPress={() => router.push("/chat/new")}
              accessibilityLabel="New chat"
              className="px-2 py-1"
              testID="new-chat"
            >
              <Text className="text-base font-semibold text-primary">New chat</Text>
            </Pressable>
          ),
        }}
      />
      <FlatList
        data={chats}
        keyExtractor={(item) => item.id}
        contentContainerClassName="p-3 gap-2"
        refreshing={refreshing}
        onRefresh={onRefresh}
        renderItem={({ item }) => (
          <Pressable
            className="rounded-xl border border-border bg-surface p-4 active:bg-surface-hover"
            onPress={() => router.push(`/chat/${item.id}`)}
            onLongPress={
              capabilities?.deleteChat ? () => confirmDelete(item.id, item.title) : undefined
            }
            testID={`chat-row-${item.id}`}
          >
            <Text className="text-base font-semibold text-text" numberOfLines={1}>
              {item.title || "Untitled"}
            </Text>
            <Text className="mt-1 text-sm text-text-muted">{formatTimestamp(item.updatedAt)}</Text>
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
