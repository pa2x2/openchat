import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, FlatList, Keyboard, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Composer, type ComposerHandle } from "./Composer";
import { ModelSheet } from "./ModelSheet";
import { AUTO_LABEL, ReasoningSheet } from "./ReasoningSheet";
import { AttachSheet } from "./AttachSheet";
import { ChatHeader, HEADER_HEIGHT, type HeaderMenuItem } from "./ChatHeader";
import { EmptyChat } from "./EmptyChat";
import { FormCard } from "./FormCard";
import { Transcript } from "./Transcript";
import { discardTemporaryChat } from "./temporaryChats";
import { AttachmentSource, pickFiles, pickImages, takePhoto } from "./pickAttachments";
import { confirmDeleteChat } from "@/src/features/drawer/ChatDrawer";
import { useDrawer } from "@/src/features/drawer/DrawerContext";
import {
  answerForm,
  discardPendingRegenerate,
  dismissForm,
  followRunningTurn,
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
import { SeededKeyboardAvoidingView, useKeyboardOpen } from "@/src/ui/keyboard";

/** Route id for the not-yet-created chat; the session is made lazily. */
export const NEW_CHAT = "new";

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
  const connected = useConnectionStore((state) => state.profile !== null);
  const list = useRef<FlatList<Message>>(null);
  const composer = useRef<ComposerHandle>(null);
  const keyboardOpen = useKeyboardOpen();
  // A screen that mounts under an open keyboard (the draft becoming a chat on
  // first send, "new chat" from the header) takes over the typing.
  const [focusOnMount] = useState(() => Keyboard.isVisible());

  const chat = useChatsStore((state) => state.chats.find((candidate) => candidate.id === chatId));
  // Only whether there is a transcript: the transcript itself changes on
  // every streamed frame, and only `Transcript` should re-render for that.
  const empty = useMessagesStore((state) => (state.byChat[chatId]?.length ?? 0) === 0);
  const turnActive = useMessagesStore((state) => state.activeTurns[chatId] ?? false);
  const turnError = useMessagesStore((state) => state.turnErrors[chatId] ?? null);
  // One at a time, oldest first: a run waits on its forms in order.
  const form = useMessagesStore((state) => state.forms[chatId]?.[0] ?? null);

  const [banner, setBanner] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reasoningSheetOpen, setReasoningSheetOpen] = useState(false);
  const [attachSheetOpen, setAttachSheetOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [draftTemporary, setDraftTemporary] = useState(false);
  const markedTemporary = useChatsStore((state) => state.temporary[chatId] === true);
  const temporary = isDraft ? draftTemporary : markedTemporary;
  const busy = useRef(false);
  const capabilities = useProviderCapabilities();
  const showReasoning = capabilities?.reasoning === true;
  const canAttach = capabilities?.attachments === true;
  const canRegenerate = capabilities?.regenerate === true;
  // A temporary chat is only temporary if the app can delete it afterwards.
  const canTemporary = capabilities?.deleteChat === true;
  const providerId = useConnectionStore((state) => state.profile?.providerId);
  const lastModel = useSettingsStore((state) =>
    providerId ? state.lastModels[providerId] : undefined,
  );
  const currentModel = (isDraft ? lastModel : (chat?.model ?? lastModel)) ?? null;
  const currentInfo = useModelsStore((state) =>
    currentModel ? state.models.find((model) => sameModelRef(model.ref, currentModel)) : undefined,
  );
  const currentLabel = currentInfo?.label ?? null;
  const variants = currentInfo?.variants ?? [];
  const variantLabel = currentModel?.variant
    ? (variants.find((variant) => variant.id === currentModel.variant)?.label ??
      currentModel.variant)
    : AUTO_LABEL;

  // Cold open: reconcile the transcript from the server (cache first), bury
  // streams this app instance is not going to continue, and pick up a run
  // that is still going on the server.
  useEffect(() => {
    if (isDraft || isTurnLive(chatId)) return;
    let cancelled = false;
    const messagesStore = useMessagesStore.getState();
    void messagesStore.fetchMessages(chatId).then(() => {
      if (cancelled) return;
      settleOrphanedStreams(chatId);
      void followRunningTurn(chatId);
    });
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && !isTurnLive(chatId)) {
        void useMessagesStore
          .getState()
          .fetchMessages(chatId)
          .then(() => followRunningTurn(chatId));
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

  // Leaving a temporary chat deletes it. Read at unmount rather than render,
  // so a chat deleted some other way meanwhile is not deleted twice.
  useEffect(() => {
    if (isDraft) return;
    return () => {
      if (useChatsStore.getState().temporary[chatId]) void discardTemporaryChat(chatId);
    };
  }, [chatId, isDraft]);

  /** Resolves to false when nothing was sent, so the composer keeps the draft. */
  async function handleSend(text: string, files: Attachment[]): Promise<boolean> {
    if (busy.current) return false;
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
        return false;
      }
      if (isDraft) {
        // Lazy chat creation: the session exists only once something is said.
        const created = await provider.createChat(
          currentModel ? { model: currentModel } : undefined,
        );
        if (draftTemporary) useChatsStore.getState().markTemporary(created.id);
        useChatsStore.getState().upsert(created);
        const streaming = sendMessage(created.id, text, files);
        router.replace({ pathname: "/chat/[id]", params: { id: created.id } });
        await streaming;
      } else {
        await sendMessage(chatId, text, files);
      }
      return true;
    } catch (error) {
      setAttachments(files);
      setBanner(error instanceof Error && error.message ? error.message : "Could not send.");
      return false;
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
      const pick = { camera: takePhoto, image: pickImages, file: pickFiles }[source];
      const picked = await pick(attachments);
      if (picked.length === 0) return;
      setAttachments((current) => [...current, ...picked]);
    } catch (error) {
      setBanner(error instanceof Error && error.message ? error.message : "Could not attach.");
    }
  }

  const handleRegenerate = useCallback(() => {
    setBanner(null);
    void regenerateReply(chatId).then((outcome) => {
      if (!outcome.ok && outcome.error) setBanner(outcome.error);
    });
  }, [chatId]);

  function handleSelectModel(model: ModelInfo) {
    // The reasoning level carries over when the new model offers it too.
    void applyModel(refWithVariant(model, currentModel?.variant));
  }

  function handleSelectVariant(variant: string | undefined) {
    if (currentInfo) void applyModel(refWithVariant(currentInfo, variant));
  }

  async function applyModel(model: ModelRef) {
    // New chats start with whatever was picked last, in any chat.
    if (providerId) useSettingsStore.getState().setLastModel(providerId, model);
    if (isDraft) return;
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

  const modelSelection = capabilities?.modelSelection === true;
  const menuItems: HeaderMenuItem[] = [];
  if (!isDraft && !temporary && capabilities?.deleteChat) {
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

  return (
    <View className="flex-1 bg-background">
      <SeededKeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View className="flex-1">
          {empty ? (
            <View className="flex-1" style={{ paddingTop: insets.top + HEADER_HEIGHT }}>
              <EmptyChat
                connected={connected}
                temporary={temporary}
                onOpenSettings={() => router.push("/settings")}
              />
            </View>
          ) : (
            <Transcript
              chatId={chatId}
              listRef={list}
              showReasoning={showReasoning}
              canRegenerate={canRegenerate}
              onRegenerate={handleRegenerate}
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
            temporary={
              isDraft && canTemporary
                ? { on: draftTemporary, onToggle: () => setDraftTemporary((on) => !on) }
                : undefined
            }
          />
        </View>

        <View
          className="mb-2 px-3 pt-1"
          style={{ paddingBottom: keyboardOpen ? 8 : insets.bottom + 8 }}
        >
          {form ? (
            <FormCard
              key={form.id}
              form={form}
              onSubmit={(answer) => answerForm(chatId, form.id, answer)}
              onDismiss={() => dismissForm(chatId, form.id)}
            />
          ) : null}
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
            placeholder={temporary ? "Temporary chat" : undefined}
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
          />
        ) : null}
        {modelSelection && variants.length > 0 ? (
          <ReasoningSheet
            visible={reasoningSheetOpen}
            onClose={() => setReasoningSheetOpen(false)}
            variants={variants}
            selected={currentModel?.variant}
            onSelect={handleSelectVariant}
          />
        ) : null}
      </SeededKeyboardAvoidingView>
    </View>
  );
}
