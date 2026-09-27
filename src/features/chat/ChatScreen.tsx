import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppState, FlatList, Keyboard, View } from "react-native";
import { Text } from "@/src/ui/Text";
import { Pressable } from "@/src/ui/Pressable";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Composer, type ComposerHandle } from "./Composer";
import { ModelSheet } from "./ModelSheet";
import { AUTO_LABEL, ReasoningSheet } from "./ReasoningSheet";
import { AttachSheet } from "./AttachSheet";
import { ChatHeader, HEADER_HEIGHT } from "./ChatHeader";
import { EmptyChat } from "./EmptyChat";
import { FormCard } from "./FormCard";
import { Transcript, TranscriptSkeleton } from "./Transcript";
import { discardTemporaryChat } from "./temporaryChats";
import { conversationMarkdown } from "./conversationText";
import { AttachmentSource, pickFiles, pickImages, takePhoto } from "./pickAttachments";
import { confirmDeleteChat, promptRenameChat } from "@/src/features/drawer/chatActions";
import { useDrawer } from "@/src/features/drawer/DrawerContext";
import { dismissTurnNotification } from "@/src/features/notifications/turnNotifications";
import {
  answerForm,
  discardPendingRegenerate,
  dismissForm,
  editLastMessage,
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
import { Icon } from "@/src/ui/Icon";
import { LinearProgress } from "@/src/ui/LinearProgress";
import type { MenuItem } from "@/src/ui/Menu";

/** Route id for the not-yet-created chat; the backend chat is made lazily. */
export const NEW_CHAT = "new";

function stageDraftTurn(text: string, attachments: Attachment[]): void {
  const messages = useMessagesStore.getState();
  const now = Date.now();
  messages.setMessages(NEW_CHAT, [
    {
      id: "draft-user",
      role: "user",
      text,
      ...(attachments.length > 0 ? { attachments } : {}),
      status: "complete",
      createdAt: now,
    },
    {
      id: "draft-assistant",
      role: "assistant",
      text: "",
      parts: [],
      status: "pending",
      createdAt: now + 1,
    },
  ]);
}

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
  const transcriptLoading = useMessagesStore((state) => state.loading[chatId] ?? false);
  const deleting = useChatsStore((state) => state.deleting[chatId] === true);
  const turnActive = useMessagesStore((state) => state.activeTurns[chatId] ?? false);
  const turnError = useMessagesStore((state) => state.turnErrors[chatId] ?? null);
  // A failed reply shows its own error, with Retry; the banner is for the
  // rest (a rerun that never started, a send the screen refused).
  const replyFailed = useMessagesStore((state) => {
    const last = state.byChat[chatId]?.at(-1);
    return last?.role === "assistant" && last.status === "error";
  });
  // One at a time, oldest first: a run waits on its forms in order.
  const form = useMessagesStore((state) => state.forms[chatId]?.[0] ?? null);

  const [banner, setBanner] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reasoningSheetOpen, setReasoningSheetOpen] = useState(false);
  const [attachSheetOpen, setAttachSheetOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  // null until the user flips the toggle: until then the draft follows the setting.
  const [temporaryToggle, setTemporaryToggle] = useState<boolean | null>(null);
  const [switchingModel, setSwitchingModel] = useState(false);
  // A sent message being edited in the composer, with what the composer held
  // before, which comes back if the edit is cancelled.
  const [editing, setEditing] = useState<{
    message: Message;
    draft: string;
    attachments: Attachment[];
  } | null>(null);
  const markedTemporary = useChatsStore((state) => state.temporary[chatId] === true);
  const busy = useRef(false);
  const capabilities = useProviderCapabilities();
  const showReasoning = capabilities?.reasoning === true;
  const canAttach = capabilities?.attachments === true;
  const modelSelection = capabilities?.modelSelection === true;
  // A temporary chat is only temporary if the app can delete it afterwards.
  const canTemporary = capabilities?.deleteChat === true;
  const defaultTemporary = useSettingsStore((state) => state.defaultChatMode === "temporary");
  // The default mode can turn the toggle on for a server that cannot delete.
  const draftTemporary = (temporaryToggle ?? defaultTemporary) && canTemporary;
  const temporary = isDraft ? draftTemporary : markedTemporary;
  const providerId = useConnectionStore((state) => state.profile?.providerId);
  const lastModel = useSettingsStore((state) =>
    providerId ? state.lastModels[providerId] : undefined,
  );
  const currentModel = (isDraft ? lastModel : (chat?.model ?? lastModel)) ?? null;
  const currentInfo = useModelsStore((state) =>
    currentModel ? state.models.find((model) => sameModelRef(model.ref, currentModel)) : undefined,
  );
  const currentLabel = currentInfo?.label ?? null;
  const modelsLoading = useModelsStore((state) => state.loading);
  const variants = currentInfo?.variants ?? [];
  const variantLabel = currentModel?.variant
    ? (variants.find((variant) => variant.id === currentModel.variant)?.label ??
      currentModel.variant)
    : AUTO_LABEL;

  // Cold open: reconcile the transcript from the server (cache first), bury
  // streams this app instance is not going to continue, and pick up a run
  // that is still going on the server. A layout effect, so the fetch is
  // marked loading before the first paint: otherwise an uncached chat flashes
  // the empty-chat greeting before its skeleton.
  useLayoutEffect(() => {
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

  // The chat's notification is stale once the user is looking at the chat.
  useEffect(() => {
    if (isDraft) return;
    dismissTurnNotification(chatId);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") dismissTurnNotification(chatId);
    });
    return () => subscription.remove();
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

  // A turn staged on the draft persists like any transcript; one left behind
  // by a kill mid-creation must not greet the next draft.
  useEffect(() => {
    if (isDraft) useMessagesStore.getState().removeChat(NEW_CHAT);
  }, [isDraft]);

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
    if (editing) return sendEdit(text);
    // Without a model the server would answer with its own default, which the
    // header can't name: the chat would run on a model the user never saw.
    if (modelSelection && !currentModel) {
      setSheetOpen(true);
      return false;
    }
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
        // Lazy chat creation: the backend chat exists only once something is said.
        stageDraftTurn(text, files);
        let created;
        try {
          created = await provider.createChat(currentModel ? { model: currentModel } : undefined);
        } finally {
          useMessagesStore.getState().removeChat(NEW_CHAT);
        }
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

  async function sendEdit(text: string): Promise<boolean> {
    const target = editing;
    if (!target) return false;
    busy.current = true;
    setEditing(null);
    setBanner(null);
    // What the composer held before the edit comes back straight away; the
    // edit itself only resolves once its reply is done.
    composer.current?.insert(target.draft, false);
    setAttachments(target.attachments);
    list.current?.scrollToOffset({ offset: 0, animated: true });
    try {
      const outcome = await editLastMessage(chatId, target.message.text, text);
      if (outcome.ok) return true;
      if (outcome.error) setBanner(outcome.error);
      // Back to editing with the edited text, so nothing typed is lost.
      setEditing({ ...target, draft: composer.current?.read() ?? target.draft });
      setAttachments([]);
      composer.current?.insert(text, false);
      return false;
    } finally {
      busy.current = false;
    }
  }

  function startEdit(message: Message) {
    // Files staged for a new message would not go with the edit; they wait
    // for it to finish, as the typed draft does.
    setEditing({ message, draft: composer.current?.read() ?? "", attachments });
    setAttachments([]);
    composer.current?.insert(message.text);
  }

  function cancelEdit() {
    if (!editing) return;
    composer.current?.insert(editing.draft, false);
    setAttachments(editing.attachments);
    setEditing(null);
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
    setSwitchingModel(true);
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
    } finally {
      setSwitchingModel(false);
    }
  }

  const menuItems: MenuItem[] = [];
  if (!isDraft && temporary) {
    menuItems.push({
      label: "Keep this chat",
      icon: "content-save-outline",
      onPress: () => useChatsStore.getState().keepTemporary(chatId),
      testID: "menu-keep",
    });
  }
  if (!isDraft && !temporary && capabilities?.renameChat) {
    menuItems.push({
      label: "Rename",
      icon: "pencil-outline",
      onPress: () => promptRenameChat({ id: chatId, title: chat?.title ?? "" }),
      testID: "menu-rename",
    });
  }
  if (!empty) {
    menuItems.push({
      label: "Copy conversation",
      icon: "text-box-multiple-outline",
      onPress: () => {
        const messages = useMessagesStore.getState().byChat[chatId] ?? [];
        void Clipboard.setStringAsync(conversationMarkdown(chat?.title ?? "", messages)).catch(
          () => undefined,
        );
      },
      testID: "menu-copy-conversation",
    });
  }
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

  const shownError = banner ?? (turnError && !replyFailed ? turnError : null);

  function dismissError() {
    if (banner) setBanner(null);
    else useMessagesStore.getState().setTurnError(chatId, null);
  }

  function handleNewChat() {
    if (isDraft) {
      composer.current?.focus();
      return;
    }
    router.replace({ pathname: "/chat/[id]", params: { id: NEW_CHAT } });
  }

  return (
    <View className="flex-1 bg-background">
      <SeededKeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View className="flex-1">
          {empty && transcriptLoading && !isDraft ? (
            <TranscriptSkeleton />
          ) : empty ? (
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
              onRegenerate={handleRegenerate}
              onEditMessage={capabilities?.regenerate ? startEdit : undefined}
              editingId={editing?.message.id ?? null}
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
            titleStatus={
              !modelSelection
                ? undefined
                : switchingModel
                  ? "busy"
                  : currentModel && !currentInfo && modelsLoading
                    ? "placeholder"
                    : undefined
            }
            menuItems={menuItems}
            temporaryLabel={temporary}
            temporary={
              isDraft && canTemporary
                ? { on: draftTemporary, onToggle: () => setTemporaryToggle(!draftTemporary) }
                : undefined
            }
          />

          {/* The skeleton already says an uncached transcript is loading. */}
          {(transcriptLoading && !empty) || deleting ? (
            <View
              pointerEvents="none"
              className="absolute left-0 right-0"
              style={{ top: insets.top }}
            >
              <LinearProgress immediate={deleting} testID="chat-progress" />
            </View>
          ) : null}
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
          {shownError ? (
            <View
              accessibilityLiveRegion="polite"
              className="mb-2 flex-row items-center gap-2.5 rounded-2xl bg-danger/10 py-1.5 pl-3 pr-1"
              testID="chat-banner"
            >
              <Icon name="alert-circle-outline" size={18} tone="danger" />
              <Text className="flex-1 py-1 text-sm leading-[19px] text-danger">{shownError}</Text>
              <Pressable
                accessibilityLabel="Dismiss"
                accessibilityRole="button"
                className="h-8 w-8 items-center justify-center rounded-full active:bg-danger/10"
                onPress={dismissError}
                testID="chat-banner-dismiss"
              >
                <Icon name="close" size={18} tone="textMuted" />
              </Pressable>
            </View>
          ) : null}
          <Composer
            ref={composer}
            autoFocus={focusOnMount}
            lockedReason={
              !connected
                ? "Connect a server to start chatting"
                : form
                  ? "Answer the question above"
                  : undefined
            }
            onSend={handleSend}
            onStop={turnActive && capabilities?.interrupt ? handleInterrupt : undefined}
            onAttach={canAttach && !editing ? () => setAttachSheetOpen(true) : undefined}
            attachments={attachments}
            onRemoveAttachment={(attachment) =>
              setAttachments((current) => current.filter((file) => file !== attachment))
            }
            editing={editing ? { onCancel: cancelEdit } : undefined}
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
