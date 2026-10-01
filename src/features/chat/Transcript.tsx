/**
 * The conversation list, with the fade into the composer and the "jump to
 * latest" button. It owns the transcript subscription so that a streaming
 * reply, which changes the transcript on every frame, re-renders only this
 * list and not the header, composer and sheets around it.
 *
 * A turn that runs on this screen is pinned: its question sits at the top of
 * the list and the reply grows into the space under it, so nothing moves
 * while the reply is read. A reply that outgrows that space runs on below the
 * fold instead of pushing its own first lines out of view. The turn stays
 * laid out that way until the next one starts or the screen is left.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Pressable } from "@/src/ui/Pressable";
import type { ChatId, Message, QueuedMessage, TurnActivity } from "@/src/domain";
import { useMessagesStore } from "@/src/stores/messages";
import { Icon } from "@/src/ui/Icon";
import { Skeleton, SkeletonGroup } from "@/src/ui/Skeleton";
import { useAppTheme, withAlpha } from "@/src/ui/theme";
import { MessageBubble } from "./MessageBubble";
import { QueuedMessages } from "./QueuedMessages";

/** How far up the transcript the "jump to latest" button appears. */
const SCROLL_BUTTON_OFFSET = 300;

/**
 * The same, while a reply is being written: what is below the fold is then
 * still arriving, so the way to it is offered as soon as the list is off it.
 */
const LIVE_SCROLL_BUTTON_OFFSET = 48;

/** Within this many px of the newest message, the list follows a streaming reply. */
const FOLLOW_OFFSET = 8;

/** Space the list keeps above the oldest message and below the newest. */
const TOP_GAP = 4;
const BOTTOM_GAP = 12;

/**
 * How close a pinned reply gets to filling the space under its question
 * before the list is told to hold its place. The hold has to be in effect
 * before the layout pass in which the reply outgrows the space, and a reply
 * can grow by several lines in one pass. Capped at half the space: under an
 * open keyboard there is little of it, and a reply that has barely started
 * must not count as filling it.
 */
const HOLD_MARGIN = 240;

// The list is inverted, so a reply growing at index 0 pushes everything above
// it up while the offset stays put: at the bottom that follows the stream, but
// scrolled away it drags the content out from under the reader. Anchoring to
// index 1 (never the streaming reply itself: Android anchors on the first
// partly visible cell, whose top in inverted space doesn't move as it grows)
// makes the native side shift the offset by the growth in the same layout pass.
const HOLD_POSITION = { minIndexForVisible: 1 };

const ASKING: TurnActivity = { kind: "asking" };

// Stands in for the reply while a turn is starting but has no reply of its own
// yet: a rerun holds the chat while it re-reads the transcript and has the
// server roll the old turn back.
const PENDING_REPLY: Message = {
  id: "pending-reply",
  role: "assistant",
  text: "",
  parts: [],
  status: "pending",
  createdAt: 0,
};

export interface TranscriptProps {
  chatId: ChatId;
  /** What covers the top of the list: the status bar, and the chat controls when they float there. */
  topInset: number;
  /**
   * The transcript is a turn staged on a chat the server is still creating.
   * No turn is live on it yet, and it is laid out as one that is.
   */
  staged?: boolean;
  showReasoning: boolean;
  onRegenerate: () => void;
  /** Present when the backend can edit a sent message. */
  onEditMessage?: (message: Message) => void;
  editingId?: string | null;
  onSendQueuedNow: (message: QueuedMessage) => void;
  onCancelQueued: (message: QueuedMessage) => void;
}

const NO_QUEUED: QueuedMessage[] = [];

export function Transcript({
  chatId,
  topInset,
  staged = false,
  showReasoning,
  onRegenerate,
  onEditMessage,
  editingId = null,
  onSendQueuedNow,
  onCancelQueued,
}: TranscriptProps) {
  const { t } = useTranslation();
  const { colors, floatingShadow } = useAppTheme();
  const listRef = useRef<FlatList<Message>>(null);
  const transcript = useMessagesStore((state) => state.byChat[chatId]);
  const turnActive = useMessagesStore((state) => state.activeTurns[chatId] ?? false);
  // An open form stalls the run, whatever the run was doing when it asked.
  const activity = useMessagesStore((state) =>
    state.forms[chatId]?.length ? ASKING : (state.activity[chatId] ?? null),
  );
  const turnError = useMessagesStore((state) => state.turnErrors[chatId] ?? null);
  const queued = useMessagesStore((state) => state.queued[chatId] ?? NO_QUEUED);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [following, setFollowing] = useState(true);

  const reversed = useMemo(() => [...(transcript ?? [])].reverse(), [transcript]);

  // A rerun always targets the newest turn, so the action belongs on the last
  // reply only, and only while no turn is live: a run cannot be rolled back
  // while it is still going.
  const lastMessage = reversed[0];
  const regenerableId = !turnActive && lastMessage?.role === "assistant" ? lastMessage.id : null;

  const liveId = turnActive && lastMessage?.role === "assistant" ? lastMessage.id : null;
  const questionIndex = reversed.findIndex((message) => message.role === "user");
  const questionId = reversed[questionIndex]?.id ?? null;
  // Editing reruns the last turn, so it is offered on the newest user message
  // only, and like a rerun only while no turn is live.
  const editableId = turnActive ? null : questionId;
  const replyPending =
    lastMessage?.role === "assistant" &&
    (lastMessage.status === "pending" || lastMessage.status === "streaming");
  const starting = turnActive && !replyPending;

  const live = turnActive || staged;
  const [wasLive, setWasLive] = useState(live);
  // The newest turn is pinned by position, not by message id: the ids change
  // when the server's copy of the transcript replaces the local one.
  const [pinned, setPinned] = useState(live);
  // The list keeps its place as the pinned reply outgrows the screen, until
  // the user returns to the newest message.
  const [held, setHeld] = useState(live);
  const [settledQuestion, setSettledQuestion] = useState(live ? null : questionId);
  const [turnStarts, setTurnStarts] = useState(0);
  if (!live && settledQuestion !== questionId) setSettledQuestion(questionId);
  if (live !== wasLive) {
    setWasLive(live);
    if (live) {
      setPinned(true);
      setHeld(true);
      // A turn picked up again (a rerun, a run followed after a reconnect)
      // leaves the list where the reader has it.
      if (questionId !== settledQuestion) {
        setTurnStarts(turnStarts + 1);
        // The scroll to the newest message is reported a frame after it is
        // asked for. A list still holding its old place until then would
        // keep it against the space that opens under the question.
        setFollowing(true);
      }
    }
  }

  // A new question starts at the newest message, wherever the transcript was.
  useEffect(() => {
    if (turnStarts > 0) listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [turnStarts]);

  const dragged = useRef(false);
  const wandered = useRef(false);
  useEffect(() => {
    if (!live) return;
    dragged.current = false;
    wandered.current = false;
  }, [live]);

  const [listHeight, setListHeight] = useState(0);
  const [questionHeight, setQuestionHeight] = useState(0);
  const [queuedHeight, setQueuedHeight] = useState(0);
  // What the reply is stretched to, so that the question above it lands at
  // the top of the list, with the queued messages under the reply. Zero
  // until the question is measured.
  const slotHeight =
    pinned && listHeight > 0 && questionHeight > 0
      ? Math.max(0, listHeight - topInset - TOP_GAP - questionHeight - queuedHeight - BOTTOM_GAP)
      : 0;
  const pinnedReplyId = pinned && questionIndex === 1 ? reversed[0].id : null;
  const [reply, setReply] = useState<{ id: string; height: number } | null>(null);
  const filling =
    slotHeight > 0 &&
    reply?.id === pinnedReplyId &&
    reply.height > slotHeight - Math.min(HOLD_MARGIN, slotHeight / 2);
  const hold = held && filling;

  const renderMessage = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const isQuestion = pinned && index === questionIndex;
      const isReply = item.id === pinnedReplyId;
      return (
        // Every cell is wrapped alike, so one that stops being the pinned
        // turn keeps its state instead of remounting.
        <View style={isReply ? { minHeight: slotHeight } : undefined}>
          <View
            onLayout={
              isQuestion
                ? (event) => setQuestionHeight(event.nativeEvent.layout.height)
                : isReply
                  ? (event) => setReply({ id: item.id, height: event.nativeEvent.layout.height })
                  : undefined
            }
          >
            <MessageBubble
              message={item}
              showReasoning={showReasoning}
              activity={item.id === liveId ? activity : null}
              onRegenerate={item.id === regenerableId ? onRegenerate : undefined}
              onEdit={item.id === editableId ? onEditMessage : undefined}
              dimmed={item.id === editingId}
              // The store keeps the reason for the latest turn only.
              error={item.id === lastMessage?.id ? turnError : null}
            />
          </View>
        </View>
      );
    },
    [
      showReasoning,
      liveId,
      activity,
      regenerableId,
      onRegenerate,
      editableId,
      onEditMessage,
      editingId,
      lastMessage?.id,
      turnError,
      pinned,
      questionIndex,
      pinnedReplyId,
      slotHeight,
    ],
  );

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    // The list is inverted: offset 0 is the newest message.
    const offset = event.nativeEvent.contentOffset.y;
    const away = offset > (live ? LIVE_SCROLL_BUTTON_OFFSET : SCROLL_BUTTON_OFFSET);
    if (away !== showScrollButton) setShowScrollButton(away);
    const atLatest = offset <= FOLLOW_OFFSET;
    if (atLatest !== following) setFollowing(atLatest);
    // Only a return the user made counts: the hold itself moves the list off
    // the newest message, and a new question scrolls it back there.
    if (!atLatest) {
      if (dragged.current) wandered.current = true;
    } else if (wandered.current) {
      wandered.current = false;
      if (held) setHeld(false);
    }
  }

  return (
    <>
      <FlatList
        ref={listRef}
        inverted
        data={reversed}
        keyExtractor={(message) => message.id}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        maintainVisibleContentPosition={following && !hold ? undefined : HOLD_POSITION}
        // On by default on Android, where it detaches off-screen cells and the
        // anchor with them, so a reply taller than the screen drags the view.
        removeClippedSubviews={false}
        onLayout={(event) => setListHeight(event.nativeEvent.layout.height)}
        onScroll={handleScroll}
        onScrollBeginDrag={() => {
          dragged.current = true;
        }}
        // Frequent enough that a drag away from the bottom stops following
        // before the stream moves the content under it.
        scrollEventThrottle={16}
        // Inverted: the header component sits at the bottom, the footer
        // at the top.
        ListHeaderComponent={
          <>
            {/* Until the pinned question has a reply of its own, this holds the reply's space. */}
            <View style={pinned && questionIndex === 0 ? { minHeight: slotHeight } : undefined}>
              {starting ? (
                <MessageBubble message={PENDING_REPLY} showReasoning={showReasoning} />
              ) : null}
            </View>
            <View onLayout={(event) => setQueuedHeight(event.nativeEvent.layout.height)}>
              {queued.length > 0 ? (
                <QueuedMessages
                  messages={queued}
                  onSendNow={onSendQueuedNow}
                  onCancel={onCancelQueued}
                />
              ) : null}
            </View>
            <View style={{ height: BOTTOM_GAP }} />
          </>
        }
        ListFooterComponent={<View style={{ height: topInset + TOP_GAP }} />}
        renderItem={renderMessage}
      />

      {/* Fade the transcript out into the composer. */}
      <View
        pointerEvents="none"
        className="absolute bottom-0 left-0 right-0 h-5"
        style={{
          experimental_backgroundImage: `linear-gradient(to bottom, ${withAlpha(colors.background, 0)}, ${colors.background})`,
        }}
      />
      {showScrollButton ? (
        <Pressable
          accessibilityLabel={t("chat.scrollToLatest")}
          accessibilityRole="button"
          className="absolute bottom-3 h-9 w-9 items-center justify-center self-center rounded-full bg-elevated"
          style={{ boxShadow: floatingShadow }}
          onPress={() => {
            setHeld(false);
            listRef.current?.scrollToOffset({ offset: 0, animated: true });
          }}
          testID="scroll-to-latest"
        >
          <Icon name="arrow-down" size={18} />
        </Pressable>
      ) : null}
    </>
  );
}

export function TranscriptSkeleton() {
  const { t } = useTranslation();
  // Bottom-anchored like the inverted list, so the transcript lands where
  // its placeholder was.
  return (
    <View className="flex-1 justify-end pb-3">
      <SkeletonGroup
        label={t("chat.loadingMessages")}
        className="px-4"
        testID="transcript-skeleton"
      >
        <Skeleton className="h-10 w-[58%] self-end rounded-[22px]" />
        <View className="mt-9 gap-3">
          <Skeleton className="h-3.5 w-[92%]" />
          <Skeleton className="h-3.5 w-[84%]" />
          <Skeleton className="h-3.5 w-[88%]" />
          <Skeleton className="h-3.5 w-[46%]" />
        </View>
        <Skeleton className="mt-9 h-10 w-[42%] self-end rounded-[22px]" />
        <View className="mt-9 gap-3">
          <Skeleton className="h-3.5 w-[90%]" />
          <Skeleton className="h-3.5 w-[64%]" />
        </View>
      </SkeletonGroup>
    </View>
  );
}
