/**
 * The undo a fresh branch offers. Branching replaces the screen with the new
 * chat, so the offer outlives the screen it was made on: the branch's screen
 * shows it, and Undo deletes the branch and goes back to the source.
 *
 * Leaving a temporary chat deletes it, which would leave Undo nothing to go
 * back to. A temporary source is kept while the offer stands, and deleted
 * once it is settled; if the app dies first, the launch purge deletes it.
 */

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { create } from "zustand";
import type { ChatId } from "@/src/domain";
import { useChatsStore } from "@/src/stores/chats";
import { Pressable } from "@/src/ui/Pressable";
import { Text } from "@/src/ui/Text";
import { discardTemporaryChat } from "./temporaryChats";

const UNDO_MS = 6000;

interface Offer {
  branchId: ChatId;
  sourceId: ChatId;
}

export const useBranchUndo = create<{ offer: Offer | null }>(() => ({ offer: null }));

export function offerBranchUndo(offer: Offer): void {
  const previous = useBranchUndo.getState().offer;
  if (previous) settleBranchUndo(previous.branchId);
  useBranchUndo.setState({ offer });
}

/** Ends the offer for `branchId`, if it stands; a temporary source is deleted now. */
export function settleBranchUndo(branchId: ChatId): void {
  const offer = useBranchUndo.getState().offer;
  if (offer?.branchId !== branchId) return;
  useBranchUndo.setState({ offer: null });
  if (useChatsStore.getState().temporary[offer.sourceId]) void discardTemporaryChat(offer.sourceId);
}

export function heldForUndo(chatId: ChatId): boolean {
  return useBranchUndo.getState().offer?.sourceId === chatId;
}

/**
 * Takes the branch back. It is marked temporary, so leaving its screen
 * deletes it the way any temporary chat goes, failures included. Returns the
 * chat to go back to, or null when the offer has already ended.
 */
export function undoBranch(branchId: ChatId): ChatId | null {
  const offer = useBranchUndo.getState().offer;
  if (offer?.branchId !== branchId) return null;
  useBranchUndo.setState({ offer: null });
  useChatsStore.getState().markTemporary(branchId);
  return offer.sourceId;
}

export function BranchUndoBar({ onUndo, onExpire }: { onUndo: () => void; onExpire: () => void }) {
  const { t } = useTranslation();

  useEffect(() => {
    const timer = setTimeout(onExpire, UNDO_MS);
    return () => clearTimeout(timer);
  }, [onExpire]);

  return (
    <View
      accessibilityLiveRegion="polite"
      className="mb-2 flex-row items-center rounded-2xl bg-text py-1 pl-4 pr-1"
      testID="branch-undo"
    >
      <Text className="flex-1 py-2 text-[14px] text-background">{t("chat.branched")}</Text>
      <Pressable
        accessibilityRole="button"
        className="rounded-full px-3.5 py-2 active:opacity-70"
        onPress={onUndo}
        testID="branch-undo-button"
      >
        <Text className="text-[14px] font-semibold text-background">{t("common.undo")}</Text>
      </Pressable>
    </View>
  );
}
