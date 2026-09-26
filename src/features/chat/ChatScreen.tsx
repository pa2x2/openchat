import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  Text,
  View,
  type KeyboardEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MessageBubble } from "./MessageBubble";
import { Composer, type ComposerHandle } from "./Composer";
import { ModelSheet } from "./ModelSheet";
import { AUTO_LABEL, ReasoningSheet } from "./ReasoningSheet";
import { AttachSheet } from "./AttachSheet";
import { ChatHeader, HEADER_HEIGHT, type HeaderMenuItem } from "./ChatHeader";
import { EmptyChat } from "./EmptyChat";
import { AttachmentSource, pickFiles, pickImages } from "./pickAttachments";
import { confirmDeleteChat } from "@/src/features/drawer/ChatDrawer";
import { useDrawer } from "@/src/features/drawer/DrawerContext";
import {
  discardPendingRegenerate,
  interruptTurn,
  isTurnLive,
  regenerateReply,
  sendMessage,
  settleOrphanedStreams,
} from "@/src/stream/streamMachine";
import { getProvider, useProviderCapabilities } from "@/src/lib/providerFactory";
import { useChatsStore } from "@/src/stores/chats";
import { useMessagesStore } from "@/src/stores/messages";
import { refWithVariant, sameModelRef, useModelsStore } from "@/src/stores/models";
import { useSettingsStore } from "@/src/stores/settings";
import { useConnectionStore } from "@/src/stores/connection";
import type { Attachment, Message, ModelInfo, ModelRef } from "@/src/domain";
import { Icon } from "@/src/ui/Icon";
import { useAppTheme, withAlpha } from "@/src/ui/theme";

/** Route id for the not-yet-created chat; the session is made lazily. */
export const NEW_CHAT = "new";

/** How far up the transcript the "jump to latest" button appears. */
const SCROLL_BUTTON_OFFSET = 300;

/**
 * Conversation screen: the transcript under a floating header, with the
 * composer pinned to the bottom.
 *
 * A chat is created on the server only when its first message is sent
 * (the `new` route); from then on the transcript reconciles from the
 * server on open and foreground.
 */
export function ChatScreen({ chatId }: { chatId: string }) {
  const isDraft = chatId === NEW_CHAT;
  const router = useRouter();
  const { openDrawer } = useDrawer();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const connected = useConnectionStore((state) => state.profile !== null);
  const list = useRef<FlatList<Message>>(null);
  const composer = useRef<ComposerHandle>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const keyboardOpen = useKeyboardOpen();
  // A screen that mounts under an open keyboard (the draft becoming a chat on
  // first send, "new chat" from the header) takes over the typing.
  const [focusOnMount] = useState(() => Keyboard.isVisible());

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
  const [reasoningSheetOpen, setReasoningSheetOpen] = useState(false);
  const [attachSheetOpen, setAttachSheetOpen] = useState(false);
  const [draftModel, setDraftModel] = useState<ModelRef | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const busy = useRef(false);
  const capabilities = useProviderCapabilities();
  const showReasoning = capabilities?.reasoning === true;
  const canAttach = capabilities?.attachments === true;
  const canRegenerate = capabilities?.regenerate === true;
  const providerId = useConnectionStore((state) => state.profile?.providerId);
  const defaultModel = useSettingsStore((state) =>
    providerId ? state.defaultModels[providerId] : undefined,
  );
  const currentModel = isDraft
    ? (draftModel ?? defaultModel ?? null)
    : (chat?.model ?? defaultModel ?? null);
  const currentInfo = useModelsStore((state) =>
    currentModel ? state.models.find((model) => sameModelRef(model.ref, currentModel)) : undefined,
  );
  const currentLabel = currentInfo?.label ?? null;
  const variants = currentInfo?.variants ?? [];
  const variantLabel = currentModel?.variant
    ? (variants.find((variant) => variant.id === currentModel.variant)?.label ??
      currentModel.variant)
    : AUTO_LABEL;

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

  // A rerun that was staged on the server but never delivered would make the
  // next message discard older turns; drop it when the chat is opened. The
  // marker is read imperatively, not watched: a rerun started from this screen
  // sets it too, and reacting to that would abandon the rerun's own rollback.
  useEffect(() => {
    if (isDraft || isTurnLive(chatId)) return;
    if (!useChatsStore.getState().pendingRegenerate[chatId]) return;
    void discardPendingRegenerate(chatId);
  }, [chatId, isDraft]);

  async function handleSend(text: string, files: Attachment[]) {
    if (busy.current) return;
    busy.current = true;
    setBanner(null);
    setAttachments([]);
    // Sending jumps to the newest message, wherever the transcript was.
    list.current?.scrollToOffset({ offset: 0, animated: true });
    try {
      const provider = await getProvider();
      if (!provider) {
        setAttachments(files);
        setBanner("Not connected. Open Settings to connect to a server.");
        return;
      }
      if (isDraft) {
        // Lazy chat creation: the session exists only once something is said.
        const created = await provider.createChat(
          currentModel ? { model: currentModel } : undefined,
        );
        useChatsStore.getState().upsert(created);
        const streaming = sendMessage(created.id, text, files);
        router.replace({ pathname: "/chat/[id]", params: { id: created.id } });
        await streaming;
      } else {
        await sendMessage(chatId, text, files);
      }
    } catch (error) {
      setAttachments(files);
      setBanner(error instanceof Error && error.message ? error.message : "Could not send.");
    } finally {
      busy.current = false;
    }
  }

  function handleInterrupt() {
    void interruptTurn(chatId);
  }

  async function handleAddAttachment(source: AttachmentSource) {
    setAttachSheetOpen(false);
    setBanner(null);
    try {
      const picked =
        source === "image" ? await pickImages(attachments) : await pickFiles(attachments);
      if (picked.length === 0) return;
      setAttachments((current) => [...current, ...picked]);
    } catch (error) {
      setBanner(error instanceof Error && error.message ? error.message : "Could not attach.");
    }
  }

  const handleRegenerate = useCallback(async () => {
    setBanner(null);
    const outcome = await regenerateReply(chatId);
    if (!outcome.ok && outcome.error) setBanner(outcome.error);
  }, [chatId]);

  function handleSelectModel(model: ModelInfo) {
    // The reasoning level carries over when the new model offers it too.
    void applyModel(refWithVariant(model, currentModel?.variant));
  }

  function handleSelectVariant(variant: string | undefined) {
    if (currentInfo) void applyModel(refWithVariant(currentInfo, variant));
  }

  async function applyModel(model: ModelRef) {
    if (isDraft) {
      setDraftModel(model);
      return;
    }
    try {
      const provider = await getProvider();
      if (!provider) {
        setBanner("Not connected. Open Settings to connect to a server.");
        return;
      }
      await provider.setChatModel(chatId, model);
      const current = useChatsStore.getState().chats.find((candidate) => candidate.id === chatId);
      if (current) useChatsStore.getState().upsert({ ...current, model });
    } catch (error) {
      setBanner(
        error instanceof Error && error.message ? error.message : "Could not switch model.",
      );
    }
  }

  // A rerun always targets the newest turn, so the action belongs on the last
  // reply only — and only while no turn is live (the server refuses to roll a
  // running session back).
  const lastMessage = messages[messages.length - 1];
  const regenerableId =
    canRegenerate && !turnActive && lastMessage?.role === "assistant" ? lastMessage.id : null;

  const modelSelection = capabilities?.modelSelection === true;
  const menuItems: HeaderMenuItem[] = [];
  if (!isDraft && capabilities?.deleteChat) {
    menuItems.push({
      label: "Delete",
      icon: "trash-can-outline",
      destructive: true,
      onPress: () =>
        confirmDeleteChat({ id: chatId, title: chat?.title ?? "" }, () =>
          router.replace({ pathname: "/chat/[id]", params: { id: NEW_CHAT } }),
        ),
      testID: "menu-delete",
    });
  }

  function handleNewChat() {
    if (isDraft) {
      composer.current?.insert("");
      return;
    }
    router.replace({ pathname: "/chat/[id]", params: { id: NEW_CHAT } });
  }

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    // The list is inverted: offset 0 is the newest message.
    const away = event.nativeEvent.contentOffset.y > SCROLL_BUTTON_OFFSET;
    if (away !== showScrollButton) setShowScrollButton(away);
  }

  const reversed = useMemo(() => [...(transcript ?? [])].reverse(), [transcript]);
  const empty = messages.length === 0;

  const renderMessage = useCallback(
    ({ item }: { item: Message }) => (
      <MessageBubble
        message={item}
        showReasoning={showReasoning}
        onRegenerate={item.id === regenerableId ? () => void handleRegenerate() : undefined}
      />
    ),
    [showReasoning, regenerableId, handleRegenerate],
  );

  return (
    <View className="flex-1 bg-background">
      <SeededKeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View className="flex-1">
          {empty ? (
            <View className="flex-1" style={{ paddingTop: insets.top + HEADER_HEIGHT }}>
              <EmptyChat connected={connected} onOpenSettings={() => router.push("/settings")} />
            </View>
          ) : (
            <FlatList
              ref={list}
              inverted
              data={reversed}
              keyExtractor={(message) => message.id}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              onScroll={handleScroll}
              scrollEventThrottle={100}
              // Inverted: the header component sits at the bottom, the footer
              // at the top, under the floating header.
              ListHeaderComponent={<View className="h-3" />}
              ListFooterComponent={<View style={{ height: insets.top + HEADER_HEIGHT + 4 }} />}
              renderItem={renderMessage}
            />
          )}

          <ChatHeader
            onOpenDrawer={() => {
              Keyboard.dismiss();
              openDrawer();
            }}
            onNewChat={handleNewChat}
            title={modelSelection ? (currentLabel ?? "Choose model") : "OpenChat"}
            onPressTitle={modelSelection ? () => setSheetOpen(true) : undefined}
            menuItems={menuItems}
          />

          {/* Fade the transcript out into the composer. */}
          <View
            pointerEvents="none"
            className="absolute bottom-0 left-0 right-0 h-5"
            style={{
              experimental_backgroundImage: `linear-gradient(to bottom, ${withAlpha(colors.background, 0)}, ${colors.background})`,
            }}
          />
          {showScrollButton && !empty ? (
            <Pressable
              accessibilityLabel="Scroll to latest"
              accessibilityRole="button"
              className="absolute bottom-3 h-9 w-9 items-center justify-center self-center rounded-full border border-border bg-elevated"
              onPress={() => list.current?.scrollToOffset({ offset: 0, animated: true })}
              testID="scroll-to-latest"
            >
              <Icon name="arrow-down" size={18} />
            </Pressable>
          ) : null}
        </View>

        <View className="px-3 pt-1" style={{ paddingBottom: keyboardOpen ? 8 : insets.bottom + 8 }}>
          {turnError ? (
            <Text className="px-2 pb-2 text-sm text-danger" testID="turn-error">
              {turnError}
            </Text>
          ) : null}
          {banner ? (
            <Text className="px-2 pb-2 text-sm text-danger" testID="chat-banner">
              {banner}
            </Text>
          ) : null}
          <Composer
            ref={composer}
            autoFocus={focusOnMount}
            onSend={handleSend}
            onStop={turnActive && capabilities?.interrupt ? handleInterrupt : undefined}
            onAttach={canAttach ? () => setAttachSheetOpen(true) : undefined}
            attachments={attachments}
            onRemoveAttachment={(attachment) =>
              setAttachments((current) => current.filter((file) => file !== attachment))
            }
            reasoning={
              modelSelection && variants.length > 0
                ? { label: variantLabel, onPress: () => setReasoningSheetOpen(true) }
                : undefined
            }
          />
        </View>

        {canAttach ? (
          <AttachSheet
            visible={attachSheetOpen}
            onClose={() => setAttachSheetOpen(false)}
            onPick={handleAddAttachment}
          />
        ) : null}
        {modelSelection ? (
          <ModelSheet
            visible={sheetOpen}
            onClose={() => setSheetOpen(false)}
            selected={currentModel}
            onSelect={handleSelectModel}
            subtitle={isDraft ? "For this new chat" : "For this chat"}
          />
        ) : null}
        {modelSelection && variants.length > 0 ? (
          <ReasoningSheet
            visible={reasoningSheetOpen}
            onClose={() => setReasoningSheetOpen(false)}
            variants={variants}
            selected={currentModel?.variant}
            onSelect={handleSelectVariant}
            subtitle={isDraft ? "For this new chat" : "For this chat"}
          />
        ) : null}
      </SeededKeyboardAvoidingView>
    </View>
  );
}

/** Whether the soft keyboard is up, so the composer can drop the nav-bar inset. */
function useKeyboardOpen(): boolean {
  // Seeded from the current state: the show event may have fired before mount.
  const [open, setOpen] = useState(() => Keyboard.isVisible());
  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", () => setOpen(true));
    const hidden = Keyboard.addListener("keyboardDidHide", () => setOpen(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  return open;
}

/**
 * React Native's KeyboardAvoidingView learns about the keyboard only from
 * show/hide events, so one mounted while the keyboard is already up lays out
 * as if it were hidden and leaves the composer under the keyboard. Seed it
 * with the keyboard's current frame; its first layout pass picks that up.
 */
class SeededKeyboardAvoidingView extends KeyboardAvoidingView {
  componentDidMount() {
    super.componentDidMount?.();
    const endCoordinates = Keyboard.metrics();
    if (!endCoordinates) return;
    // `_keyboardEvent` is the component's own record of the last show event.
    (this as unknown as { _keyboardEvent: KeyboardEvent })._keyboardEvent = {
      duration: 0,
      easing: "keyboard",
      endCoordinates,
    };
  }
}
