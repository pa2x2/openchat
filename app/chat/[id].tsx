import { useEffect, useRef, useState } from "react";
import { AppState, FlatList, KeyboardAvoidingView, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useColorScheme } from "nativewind";
import { themes } from "@/src/ui/theme";
import { Bubble } from "@/src/ui";
import { Composer } from "@/src/features/chat/Composer";
import { ModelSheet } from "@/src/features/chat/ModelSheet";
import {
  interruptTurn,
  isTurnLive,
  sendMessage,
  settleOrphanedStreams,
} from "@/src/stream/streamMachine";
import { getProvider, useProviderCapabilities } from "@/src/lib/providerFactory";
import { useChatsStore } from "@/src/stores/chats";
import { useMessagesStore } from "@/src/stores/messages";
import { sameModelRef, useModelsStore } from "@/src/stores/models";
import { useSettingsStore } from "@/src/stores/settings";
import { useConnectionStore } from "@/src/stores/connection";
import type { ModelInfo } from "@/src/domain";

/** Route id for the not-yet-created chat; the session is made lazily. */
const NEW_CHAT = "new";

/**
 * Conversation screen: message list + composer.
 *
 * A chat is created on the server only when its first message is sent
 * (the `new` route); from then on the transcript reconciles from the
 * server on open and foreground.
 */
export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chatId = id ?? NEW_CHAT;
  const isDraft = chatId === NEW_CHAT;
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme ?? "light";

  const chat = useChatsStore((state) => state.chats.find((candidate) => candidate.id === chatId));
  // The empty-array fallback lives outside the selector: a fresh `[]` per
  // render would make zustand's identity check re-render forever on empty
  // chats.
  const transcript = useMessagesStore((state) => state.byChat[chatId]);
  const messages = transcript ?? [];
  const turnActive = useMessagesStore((state) => state.activeTurns[chatId] ?? false);
  const turnError = useMessagesStore((state) => state.turnErrors[chatId] ?? null);

  const [banner, setBanner] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draftModel, setDraftModel] = useState<ModelInfo["ref"] | null>(null);
  const busy = useRef(false);
  const capabilities = useProviderCapabilities();
  const providerId = useConnectionStore((state) => state.profile?.providerId);
  const defaultModel = useSettingsStore((state) =>
    providerId ? state.defaultModels[providerId] : undefined,
  );
  const currentModel = isDraft
    ? (draftModel ?? defaultModel ?? null)
    : (chat?.model ?? defaultModel ?? null);
  const currentLabel = useModelsStore((state) =>
    currentModel
      ? (state.models.find((model) => sameModelRef(model.ref, currentModel))?.label ?? null)
      : null,
  );

  // Cold open: reconcile the transcript from the server (cache first),
  // then bury streams this app instance is not going to continue.
  useEffect(() => {
    if (isDraft || isTurnLive(chatId)) return;
    let cancelled = false;
    const messagesStore = useMessagesStore.getState();
    void messagesStore.fetchMessages(chatId).then(() => {
      if (!cancelled) settleOrphanedStreams(chatId);
    });
    // Re-reconcile when the app comes back to the foreground.
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && !isTurnLive(chatId)) {
        void useMessagesStore.getState().fetchMessages(chatId);
      }
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [chatId, isDraft]);

  async function handleSend(text: string) {
    if (busy.current) return;
    busy.current = true;
    setBanner(null);
    try {
      const provider = await getProvider();
      if (!provider) {
        setBanner("Not connected. Open Settings to connect to a server.");
        return;
      }
      if (isDraft) {
        // Lazy chat creation: the session exists only once something is said.
        const created = await provider.createChat(
          currentModel ? { model: currentModel } : undefined,
        );
        useChatsStore.getState().upsert(created);
        const streaming = sendMessage(created.id, text);
        router.replace({ pathname: "/chat/[id]", params: { id: created.id } });
        await streaming;
      } else {
        await sendMessage(chatId, text);
      }
    } catch (error) {
      setBanner(error instanceof Error && error.message ? error.message : "Could not send.");
    } finally {
      busy.current = false;
    }
  }

  function handleInterrupt() {
    void interruptTurn(chatId);
  }

  async function handleSelectModel(model: ModelInfo) {
    if (isDraft) {
      setDraftModel(model.ref);
      return;
    }
    try {
      const provider = await getProvider();
      if (!provider) {
        setBanner("Not connected. Open Settings to connect to a server.");
        return;
      }
      await provider.setChatModel(chatId, model.ref);
      const current = useChatsStore.getState().chats.find((candidate) => candidate.id === chatId);
      if (current) useChatsStore.getState().upsert({ ...current, model: model.ref });
    } catch (error) {
      setBanner(
        error instanceof Error && error.message ? error.message : "Could not switch model.",
      );
    }
  }

  const title = isDraft ? "New chat" : chat?.title || "Chat";

  return (
    <View style={themes[scheme]} className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title,
          headerRight:
            capabilities?.modelSelection === true
              ? () => (
                  <Pressable
                    onPress={() => setSheetOpen(true)}
                    accessibilityLabel="Choose model"
                    className="max-w-36 px-2 py-1"
                    testID="model-button"
                  >
                    <Text className="text-sm font-semibold text-primary" numberOfLines={1}>
                      {currentLabel ?? "Model"}
                    </Text>
                  </Pressable>
                )
              : undefined,
        }}
      />
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        {messages.length === 0 ? (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-lg font-semibold text-text">
              {isDraft ? "Say something to start" : "No messages yet"}
            </Text>
            <Text className="mt-2 text-center text-sm text-text-muted">
              Replies stream in as plain text for now.
            </Text>
          </View>
        ) : (
          <FlatList
            inverted
            data={[...messages].reverse()}
            keyExtractor={(message) => message.id}
            contentContainerClassName="px-2 py-3 gap-1"
            renderItem={({ item }) => (
              <Bubble
                role={item.role}
                text={item.status === "streaming" && item.text.length === 0 ? "…" : item.text}
                status={
                  item.status === "streaming"
                    ? "streaming…"
                    : item.status === "error"
                      ? "failed"
                      : item.status === "interrupted"
                        ? "stopped"
                        : undefined
                }
                testID={`bubble-${item.role}`}
              />
            )}
          />
        )}

        {turnError ? (
          <Text className="px-4 pb-1 text-sm text-danger" testID="turn-error">
            {turnError}
          </Text>
        ) : null}
        {banner ? (
          <Text className="px-4 pb-1 text-sm text-danger" testID="chat-banner">
            {banner}
          </Text>
        ) : null}

        <Composer
          onSend={handleSend}
          onStop={turnActive && capabilities?.interrupt ? handleInterrupt : undefined}
        />
        {capabilities?.modelSelection === true ? (
          <ModelSheet
            visible={sheetOpen}
            onClose={() => setSheetOpen(false)}
            selected={currentModel}
            onSelect={handleSelectModel}
          />
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}
