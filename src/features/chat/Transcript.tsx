/**
 * The conversation list, with the fade into the composer and the "jump to
 * latest" button. It owns the transcript subscription so that a streaming
 * reply, which changes the transcript on every frame, re-renders only this
 * list and not the header, composer and sheets around it.
 */

import { useCallback, useMemo, useState, type RefObject } from "react";
import {
  FlatList,
  Pressable,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ChatId, Message } from "@/src/domain";
import { useMessagesStore } from "@/src/stores/messages";
import { Icon } from "@/src/ui/Icon";
import { useAppTheme, withAlpha } from "@/src/ui/theme";
import { HEADER_HEIGHT } from "./ChatHeader";
import { MessageBubble } from "./MessageBubble";

/** How far up the transcript the "jump to latest" button appears. */
const SCROLL_BUTTON_OFFSET = 300;

/** Within this many px of the newest message, the list follows a streaming reply. */
const FOLLOW_OFFSET = 8;

// The list is inverted, so a reply growing at index 0 pushes everything above
// it up while the offset stays put: at the bottom that follows the stream, but
// scrolled away it drags the content out from under the reader. Anchoring to
// index 1 (never the streaming reply itself: Android anchors on the first
// partly visible cell, whose top in inverted space doesn't move as it grows)
// makes the native side shift the offset by the growth in the same layout pass.
const HOLD_POSITION = { minIndexForVisible: 1 };

export interface TranscriptProps {
  chatId: ChatId;
  listRef: RefObject<FlatList<Message> | null>;
  showReasoning: boolean;
  canRegenerate: boolean;
  onRegenerate: () => void;
}

export function Transcript({
  chatId,
  listRef,
  showReasoning,
  canRegenerate,
  onRegenerate,
}: TranscriptProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const transcript = useMessagesStore((state) => state.byChat[chatId]);
  const turnActive = useMessagesStore((state) => state.activeTurns[chatId] ?? false);
  const activity = useMessagesStore((state) => state.activity[chatId] ?? null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [following, setFollowing] = useState(true);

  const reversed = useMemo(() => [...(transcript ?? [])].reverse(), [transcript]);

  // A rerun always targets the newest turn, so the action belongs on the last
  // reply only — and only while no turn is live (the server refuses to roll a
  // running session back).
  const lastMessage = reversed[0];
  const regenerableId =
    canRegenerate && !turnActive && lastMessage?.role === "assistant" ? lastMessage.id : null;

  const liveId = turnActive && lastMessage?.role === "assistant" ? lastMessage.id : null;

  const renderMessage = useCallback(
    ({ item }: { item: Message }) => (
      <MessageBubble
        message={item}
        showReasoning={showReasoning}
        activity={item.id === liveId ? activity : null}
        onRegenerate={item.id === regenerableId ? onRegenerate : undefined}
      />
    ),
    [showReasoning, liveId, activity, regenerableId, onRegenerate],
  );

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    // The list is inverted: offset 0 is the newest message.
    const offset = event.nativeEvent.contentOffset.y;
    const away = offset > SCROLL_BUTTON_OFFSET;
    if (away !== showScrollButton) setShowScrollButton(away);
    const atLatest = offset <= FOLLOW_OFFSET;
    if (atLatest !== following) setFollowing(atLatest);
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
        maintainVisibleContentPosition={following ? undefined : HOLD_POSITION}
        onScroll={handleScroll}
        // Frequent enough that a drag away from the bottom stops following
        // before the stream moves the content under it.
        scrollEventThrottle={16}
        // Inverted: the header component sits at the bottom, the footer
        // at the top, under the floating header.
        ListHeaderComponent={<View className="h-3" />}
        ListFooterComponent={<View style={{ height: insets.top + HEADER_HEIGHT + 4 }} />}
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
          accessibilityLabel="Scroll to latest"
          accessibilityRole="button"
          className="absolute bottom-3 h-9 w-9 items-center justify-center self-center rounded-full border border-border bg-elevated"
          onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
          testID="scroll-to-latest"
        >
          <Icon name="arrow-down" size={18} />
        </Pressable>
      ) : null}
    </>
  );
}
