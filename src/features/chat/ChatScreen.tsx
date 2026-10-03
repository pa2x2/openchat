import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppState, Keyboard, View } from "react-native";
import { Text } from "@/src/ui/Text";
import { Pressable } from "@/src/ui/Pressable";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Composer, type ComposerHandle, type EditTarget } from "./Composer";
import { ModelSheet } from "./ModelSheet";
import { AttachSheet } from "./AttachSheet";
import {
  ChatHeader,
  ChatTitleBar,
  HEADER_HEIGHT,
  TITLE_BAR_HEIGHT,
  type BranchSource,
} from "./ChatHeader";
import { EmptyChat } from "./EmptyChat";
import { FormCard } from "./FormCard";
import { RecentChats } from "./RecentChats";
import { Transcript, TranscriptSkeleton } from "./Transcript";
import { UsageSheet } from "./UsageSheet";
import { discardTemporaryChat } from "./temporaryChats";
import {
  BranchUndoBar,
  heldForUndo,
  offerBranchUndo,
  settleBranchUndo,
  undoBranch,
  useBranchUndo,
} from "./branchUndo";
import { conversationMarkdown } from "./conversationText";
import { AttachmentSource, pickFiles, pickImages, takePhoto } from "./pickAttachments";
import { confirmDeleteChat, promptRenameChat } from "@/src/features/drawer/chatActions";
import { useDrawer } from "@/src/features/drawer/DrawerContext";
import { dismissTurnNotification } from "@/src/features/notifications/turnNotifications";
import {
  answerForm,
  branchChat,
  branchForEdit,
  cancelQueuedMessage,
  compactChat,
  discardPendingRegenerate,
  dismissForm,
  editMessage,
  followRunningTurn,
  interruptTurn,
  isTurnLive,
  queueMessage,
  regenerateReply,
  sendMessage,
  sendQueuedNow,
  settleOrphanedStreams,
  syncQueue,
} from "@/src/stream/streamMachine";
import { getProvider, useProviderCapabilities } from "@/src/lib/providerFactory";
import { useChatsStore } from "@/src/stores/chats";
import { useMessagesStore } from "@/src/stores/messages";
import { refWithVariant, sameModelRef, useModelsStore } from "@/src/stores/models";
import { useSettingsStore } from "@/src/stores/settings";
import { useConnectionStore } from "@/src/stores/connection";
import { chatTitle } from "@/src/lib/chatTitle";
import { cn } from "@/src/lib/cn";
import {
  UNTITLED_CHAT,
  type Attachment,
  type Message,
  type ModelInfo,
  type ModelRef,
  type QueuedMessage,
} from "@/src/domain";
import { SeededKeyboardAvoidingView, useKeyboardOpen } from "@/src/ui/keyboard";
import { Icon } from "@/src/ui/Icon";
import { LinearProgress } from "@/src/ui/LinearProgress";
import type { MenuItem } from "@/src/ui/Menu";

/** Route id for the not-yet-created chat; the backend chat is made lazily. */
export const NEW_CHAT = "new";

/** Returns when the turn was staged, which is when the user sent it. */
function stageDraftTurn(text: string, attachments: Attachment[]): number {
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
  return now;
}

/**
 * Conversation screen: the transcript, with the composer pinned to the
 * bottom. The chat controls float over the top of the transcript or sit in a
 * row under the composer, as the user set.
 *
 * A chat is created on the server only when its first message is sent
 * (the `new` route); from then on the transcript reconciles from the
 * server on open and foreground.
 */
export function ChatScreen({ chatId }: { chatId: string }) {
  const isDraft = chatId === NEW_CHAT;
  const { t } = useTranslation();
  const router = useRouter();
  const { openDrawer } = useDrawer();
  const insets = useSafeAreaInsets();
  const connected = useConnectionStore((state) => state.profile !== null);
  const composer = useRef<ComposerHandle>(null);
  const keyboardOpen = useKeyboardOpen();
  // A screen that mounts under an open keyboard (the draft becoming a chat on
  // first send, "new chat" from the header) takes over the typing.
  const [focusOnMount] = useState(() => Keyboard.isVisible());

  const chat = useChatsStore((state) => state.chats.find((candidate) => candidate.id === chatId));
  const sourceId = chat?.branchedFrom;
  const source = useChatsStore((state) =>
    sourceId ? state.chats.find((candidate) => candidate.id === sourceId) : undefined,
  );
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
  const [attachSheetOpen, setAttachSheetOpen] = useState(false);
  const [usageSheetOpen, setUsageSheetOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  // null until the user flips the toggle: until then the draft follows the setting.
  const [temporaryToggle, setTemporaryToggle] = useState<boolean | null>(null);
  const [switchingModel, setSwitchingModel] = useState(false);
  const [branching, setBranching] = useState(false);
  // A sent message being edited in the composer, with what the composer held
  // before, which comes back if the edit is cancelled.
  const [editing, setEditing] = useState<{
    message: Message;
    draft: string;
    attachments: Attachment[];
    target: EditTarget;
  } | null>(null);
  const editRemoves = useMessagesStore((state) => {
    if (!editing) return 0;
    const transcript = state.byChat[chatId] ?? [];
    const index = transcript.findIndex((message) => message.id === editing.message.id);
    return index < 0 ? 0 : transcript.length - 1 - index;
  });
  const markedTemporary = useChatsStore((state) => state.temporary[chatId] === true);
  const busy = useRef(false);
  const capabilities = useProviderCapabilities();
  const showReasoning = capabilities?.reasoning === true;
  const canAttach = capabilities?.attachments === true;
  const canQueue = capabilities?.queue === true;
  const modelSelection = capabilities?.modelSelection === true;
  const canDelete = capabilities?.deleteChat === true;
  const canEditInNewChat = !isDraft && capabilities?.branch === true;
  // A temporary chat is only temporary if the app can delete it afterwards.
  const canTemporary = canDelete;
  const controls = useSettingsStore((state) => state.chatControls);
  const topInset = insets.top + (controls === "top" ? HEADER_HEIGHT : TITLE_BAR_HEIGHT);
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
  // The newest reply that says how full the context is. One that failed
  // before its first step says nothing, and must not take the meter away.
  // Read as two plain values: the reply itself changes on every streamed frame.
  const contextTokens = useMessagesStore(
    (state) =>
      state.byChat[chatId]?.findLast((message) => message.contextTokens !== undefined)
        ?.contextTokens,
  );
  const contextModel = useMessagesStore(
    (state) =>
      state.byChat[chatId]?.findLast((message) => message.contextTokens !== undefined)?.model,
  );
  // The next message runs on the chat's model, so its window is the one that
  // counts; a chat without one is measured against the model that replied.
  const windowModel = chat?.model ?? contextModel;
  const contextWindow = useModelsStore((state) =>
    windowModel
      ? state.models.find((model) => sameModelRef(model.ref, windowModel))?.contextWindow
      : undefined,
  );
  const context =
    contextTokens !== undefined ? { tokens: contextTokens, window: contextWindow } : null;
  const variants = currentInfo?.variants ?? [];
  const variantLabel = currentModel?.variant
    ? (variants.find((variant) => variant.id === currentModel.variant)?.label ??
      currentModel.variant)
    : t("models.auto");

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
      void syncQueue(chatId);
      void followRunningTurn(chatId);
    });
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && !isTurnLive(chatId)) {
        void useMessagesStore
          .getState()
          .fetchMessages(chatId)
          .then(() => {
            void syncQueue(chatId);
            return followRunningTurn(chatId);
          });
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

  // The server names a chat once it has a message to name it after, and the
  // chat list is otherwise only re-read when the sidebar opens.
  const named = Boolean(chat?.title) && chat?.title !== UNTITLED_CHAT;
  useEffect(() => {
    if (!isDraft && !turnActive && !named) void useChatsStore.getState().refresh();
  }, [isDraft, turnActive, named]);

  // Leaving a temporary chat deletes it, unless a branch made from it can
  // still be undone back to it. Read at unmount rather than render, so a chat
  // deleted some other way meanwhile is not deleted twice.
  useEffect(() => {
    if (isDraft) return;
    return () => {
      settleBranchUndo(chatId);
      if (useChatsStore.getState().temporary[chatId] && !heldForUndo(chatId)) {
        void discardTemporaryChat(chatId);
      }
    };
  }, [chatId, isDraft]);

  // Undo would delete whatever the branch has gained since.
  const undoOffered = useBranchUndo((state) => state.offer?.branchId === chatId);
  useEffect(() => {
    if (turnActive) settleBranchUndo(chatId);
  }, [chatId, turnActive]);
  const expireUndo = useCallback(() => settleBranchUndo(chatId), [chatId]);

  /** Resolves to false when nothing was sent, so the composer keeps the draft. */
  async function handleSend(text: string, files: Attachment[]): Promise<boolean> {
    if (busy.current) return false;
    if (editing) return sendEdit(text);
    // Without a model the server would answer with its own default, which the
    // composer can't name: the chat would run on a model the user never saw.
    if (modelSelection && !currentModel) {
      setSheetOpen(true);
      return false;
    }
    busy.current = true;
    setBanner(null);
    setAttachments([]);
    // Failures are caught on the promise rather than with try: React Compiler
    // 1.0 skips the whole screen over a try that has a `finally`, a `throw`
    // or a conditional expression in it.
    const sent = await deliver(text, files).then(
      () => true,
      (error: unknown) => {
        setAttachments(files);
        setBanner(error instanceof Error && error.message ? error.message : t("chat.sendFailed"));
        return false;
      },
    );
    busy.current = false;
    return sent;
  }

  async function deliver(text: string, files: Attachment[]) {
    const provider = await getProvider();
    if (!provider) throw new Error(t("errors.notConnected"));
    if (!isDraft) {
      await sendMessage(chatId, text, files);
      return;
    }
    // Lazy chat creation: the backend chat exists only once something is said.
    const sentAt = stageDraftTurn(text, files);
    const created = await provider
      .createChat(currentModel ? { model: currentModel } : undefined)
      .finally(() => useMessagesStore.getState().removeChat(NEW_CHAT));
    if (draftTemporary) useChatsStore.getState().markTemporary(created.id);
    useChatsStore.getState().upsert(created);
    const streaming = sendMessage(created.id, text, files, sentAt);
    router.replace({ pathname: "/chat/[id]", params: { id: created.id } });
    await streaming;
  }

  async function handleQueue(text: string, files: Attachment[]): Promise<boolean> {
    // The reply can end between the last render and the tap.
    if (!isTurnLive(chatId)) return handleSend(text, files);
    setBanner(null);
    setAttachments([]);
    try {
      await queueMessage(chatId, text, files);
      return true;
    } catch (error) {
      setAttachments(files);
      setBanner(error instanceof Error && error.message ? error.message : t("chat.sendFailed"));
      return false;
    }
  }

  const handleSendQueuedNow = useCallback(
    (message: QueuedMessage) => {
      setBanner(null);
      sendQueuedNow(chatId, message.id).catch(() => setBanner(t("queue.sendNowFailed")));
    },
    [chatId, t],
  );

  /** Takes the message back into the composer, after whatever is typed there. */
  const handleCancelQueued = useCallback(
    (message: QueuedMessage) => {
      setBanner(null);
      cancelQueuedMessage(chatId, message.id).then(
        (taken) => {
          const draft = composer.current?.read().trim() ?? "";
          composer.current?.insert(draft ? `${draft}\n\n${taken.text}` : taken.text);
          const files = taken.attachments;
          if (files) setAttachments((current) => [...current, ...files]);
        },
        () => setBanner(t("queue.cancelFailed")),
      );
    },
    [chatId, t],
  );

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
    const outcome = await (
      target.target === "new"
        ? sendEditToBranch(target.message, text)
        : editMessage(chatId, target.message, text)
    ).finally(() => {
      busy.current = false;
    });
    if (outcome.ok) return true;
    if (outcome.error) setBanner(outcome.error);
    // Back to editing with the edited text, so nothing typed is lost.
    setEditing({ ...target, draft: composer.current?.read() ?? target.draft });
    setAttachments([]);
    composer.current?.insert(text, false);
    return false;
  }

  async function sendEditToBranch(
    message: Message,
    text: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const outcome = await branchForEdit(chatId, message);
    if (!outcome.ok) return outcome;
    const streaming = sendMessage(outcome.chat.id, text, outcome.attachments);
    router.replace({ pathname: "/chat/[id]", params: { id: outcome.chat.id } });
    await streaming;
    return { ok: true };
  }

  function startEdit(message: Message) {
    // Files staged for a new message would not go with the edit; they wait
    // for it to finish, as the typed draft does.
    setEditing({ message, draft: composer.current?.read() ?? "", attachments, target: "here" });
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

  function handleCompact() {
    setUsageSheetOpen(false);
    setBanner(null);
    compactChat(chatId).catch(() => setBanner(t("context.compactFailed")));
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
      setBanner(error instanceof Error && error.message ? error.message : t("chat.attachFailed"));
    }
  }

  const handleRegenerate = useCallback(() => {
    setBanner(null);
    void regenerateReply(chatId).then((outcome) => {
      if (!outcome.ok && outcome.error) setBanner(outcome.error);
    });
  }, [chatId]);

  // The icon stays tappable while the fork is made; a second tap would make a second chat.
  const branchingNow = useRef(false);
  const handleBranch = useCallback(
    (reply: Message) => {
      if (branchingNow.current) return;
      branchingNow.current = true;
      setBanner(null);
      setBranching(true);
      void branchChat(chatId, reply).then((outcome) => {
        branchingNow.current = false;
        setBranching(false);
        if (!outcome.ok) {
          setBanner(outcome.error);
          return;
        }
        if (canDelete) offerBranchUndo({ branchId: outcome.chat.id, sourceId: chatId });
        router.replace({ pathname: "/chat/[id]", params: { id: outcome.chat.id } });
      });
    },
    [chatId, router, canDelete],
  );

  function handleUndoBranch() {
    const sourceId = undoBranch(chatId);
    if (sourceId) router.replace({ pathname: "/chat/[id]", params: { id: sourceId } });
  }

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
    await switchModel(model).catch((error: unknown) =>
      setBanner(
        error instanceof Error && error.message ? error.message : t("chat.switchModelFailed"),
      ),
    );
    setSwitchingModel(false);
  }

  async function switchModel(model: ModelRef) {
    const provider = await getProvider();
    if (!provider) throw new Error(t("errors.notConnected"));
    await provider.setChatModel(chatId, model);
    const current = useChatsStore.getState().chats.find((candidate) => candidate.id === chatId);
    if (current) useChatsStore.getState().upsert({ ...current, model });
  }

  const menuItems: MenuItem[] = [];
  if (!isDraft && temporary) {
    menuItems.push({
      label: t("chat.menu.keep"),
      icon: "content-save-outline",
      onPress: () => useChatsStore.getState().keepTemporary(chatId),
      testID: "menu-keep",
    });
  }
  const rename =
    !isDraft && !temporary && capabilities?.renameChat
      ? () => promptRenameChat({ id: chatId, title: chat?.title ?? "" })
      : undefined;
  if (rename) {
    menuItems.push({
      label: t("chat.menu.rename"),
      icon: "pencil-outline",
      onPress: rename,
      testID: "menu-rename",
    });
  }
  if (!empty) {
    menuItems.push({
      label: t("chat.menu.copyConversation"),
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
  if (!isDraft && !temporary && canDelete) {
    menuItems.push({
      label: t("chat.menu.delete"),
      icon: "trash-can-outline",
      destructive: true,
      onPress: () =>
        confirmDeleteChat({ id: chatId, title: chat?.title ?? "" }, () =>
          router.replace({ pathname: "/chat/[id]", params: { id: NEW_CHAT } }),
        ),
      testID: "menu-delete",
    });
  }

  const title = !isDraft && named && chat ? chat.title : null;
  // A source missing from the list has been deleted.
  const branchedFrom: BranchSource | undefined = !sourceId
    ? undefined
    : source
      ? {
          title: chatTitle(t, source.title),
          onOpen: () => router.replace({ pathname: "/chat/[id]", params: { id: source.id } }),
        }
      : { title: null };
  const header = (
    <ChatHeader
      placement={controls}
      onOpenDrawer={() => {
        Keyboard.dismiss();
        openDrawer();
      }}
      onNewChat={handleNewChat}
      title={title}
      menuItems={menuItems}
      temporaryLabel={temporary}
      branchedFrom={branchedFrom}
      temporary={
        isDraft && canTemporary
          ? { on: draftTemporary, onToggle: () => setTemporaryToggle(!draftTemporary) }
          : undefined
      }
    />
  );
  // Typing needs the room, and nothing in the row is for a message being written.
  const controlsBelow = controls === "bottom" && !keyboardOpen;

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
            <View className="flex-1" style={{ paddingTop: topInset }}>
              <EmptyChat
                connected={connected}
                temporary={temporary}
                onOpenSettings={() => router.push("/settings")}
              />
            </View>
          ) : (
            <Transcript
              chatId={chatId}
              topInset={topInset}
              staged={isDraft}
              showReasoning={showReasoning}
              onRegenerate={handleRegenerate}
              onEditMessage={capabilities?.regenerate ? startEdit : undefined}
              onBranch={!isDraft && capabilities?.branch ? handleBranch : undefined}
              editingId={editing?.message.id ?? null}
              editReplaces={editing?.target !== "new"}
              onSendQueuedNow={handleSendQueuedNow}
              onCancelQueued={handleCancelQueued}
            />
          )}

          {controls === "top" ? (
            header
          ) : (
            <ChatTitleBar
              title={title}
              temporaryLabel={temporary}
              branchedFrom={branchedFrom}
              onRename={rename}
            />
          )}

          {/* The skeleton already says an uncached transcript is loading. */}
          {(transcriptLoading && !empty) || deleting || branching ? (
            <View
              pointerEvents="none"
              className="absolute left-0 right-0"
              style={{ top: insets.top }}
            >
              <LinearProgress immediate={deleting || branching} testID="chat-progress" />
            </View>
          ) : null}
        </View>

        <View
          className={cn("px-3 pt-1", controlsBelow ? "mb-0.5" : "mb-2")}
          style={{
            paddingBottom: keyboardOpen ? 8 : insets.bottom + (controlsBelow ? 2 : 8),
          }}
        >
          {isDraft && empty && connected && !temporary && !keyboardOpen ? (
            <RecentChats
              onOpen={(id) => router.replace({ pathname: "/chat/[id]", params: { id } })}
            />
          ) : null}
          {undoOffered ? <BranchUndoBar onUndo={handleUndoBranch} onExpire={expireUndo} /> : null}
          {form ? (
            <FormCard
              key={form.id}
              form={form}
              onSubmit={(answer, result) => answerForm(chatId, form, answer, result)}
              onDismiss={(result) => dismissForm(chatId, form, result)}
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
                accessibilityLabel={t("common.dismiss")}
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
            draftKey={editing ? undefined : chatId}
            autoFocus={focusOnMount}
            lockedReason={
              !connected
                ? t("composer.locked.notConnected")
                : form
                  ? t("composer.locked.form")
                  : undefined
            }
            onSend={handleSend}
            onStop={turnActive && capabilities?.interrupt ? handleInterrupt : undefined}
            onQueue={turnActive && canQueue ? handleQueue : undefined}
            onAttach={canAttach && !editing ? () => setAttachSheetOpen(true) : undefined}
            attachments={attachments}
            onRemoveAttachment={(attachment) =>
              setAttachments((current) => current.filter((file) => file !== attachment))
            }
            editing={
              editing
                ? {
                    label:
                      editing.target === "new"
                        ? t("composer.keepsChat")
                        : editRemoves === 0
                          ? t("composer.editing")
                          : canEditInNewChat
                            ? t("composer.removesLater", { count: editRemoves })
                            : t("composer.editingRemoves", { count: editRemoves }),
                    onCancel: cancelEdit,
                    target: canEditInNewChat
                      ? {
                          value: editing.target,
                          onChange: (target) => setEditing({ ...editing, target }),
                        }
                      : undefined,
                  }
                : undefined
            }
            context={context ? { ...context, onPress: () => setUsageSheetOpen(true) } : undefined}
            model={
              modelSelection
                ? {
                    label: currentLabel ?? t("models.choose"),
                    level: variants.length > 0 ? variantLabel : undefined,
                    status: switchingModel
                      ? "busy"
                      : currentModel && !currentInfo && modelsLoading
                        ? "placeholder"
                        : undefined,
                    onPress: () => setSheetOpen(true),
                  }
                : undefined
            }
          />
          {controlsBelow ? header : null}
        </View>

        {canAttach ? (
          <AttachSheet
            visible={attachSheetOpen}
            onClose={() => setAttachSheetOpen(false)}
            onPick={handleAddAttachment}
          />
        ) : null}
        <UsageSheet
          visible={usageSheetOpen}
          onClose={() => setUsageSheetOpen(false)}
          context={context}
          usage={chat?.usage}
          cost={chat?.cost}
          onCompact={capabilities?.compact && connected && !turnActive ? handleCompact : undefined}
        />
        {modelSelection ? (
          <ModelSheet
            visible={sheetOpen}
            onClose={() => setSheetOpen(false)}
            selected={currentModel}
            onSelect={handleSelectModel}
            variants={variants}
            onSelectVariant={handleSelectVariant}
          />
        ) : null}
      </SeededKeyboardAvoidingView>
    </View>
  );
}
