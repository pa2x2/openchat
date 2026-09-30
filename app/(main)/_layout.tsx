import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState, BackHandler, useWindowDimensions } from "react-native";
import { Stack, useGlobalSearchParams, useRouter } from "expo-router";
import { Drawer } from "react-native-drawer-layout";
import type { LegacyPanGesture, PanGesture } from "react-native-gesture-handler";
import { ChatDrawer } from "@/src/features/drawer/ChatDrawer";
import { DrawerContext } from "@/src/features/drawer/DrawerContext";
import { purgeTemporaryChats } from "@/src/features/chat/temporaryChats";
import { getProvider } from "@/src/lib/providerFactory";
import { useChatsStore } from "@/src/stores/chats";
import { useConnectionStore } from "@/src/stores/connection";
import { watchCatalog } from "@/src/stores/models";
import { useAppTheme, withAlpha } from "@/src/ui/theme";

/** Horizontal travel (dp) before a swipe opens the sidebar; above ScrollView's touch slop. */
const OPEN_SWIPE_OFFSET = 12;

/**
 * Main layout: the conversation fills the screen and the chat list lives in
 * a sidebar that slides over it (button or swipe), as in ChatGPT.
 */
export default function MainLayout() {
  const router = useRouter();
  const { id } = useGlobalSearchParams<{ id?: string }>();
  const { width } = useWindowDimensions();
  const { colors } = useAppTheme();
  const refreshChats = useChatsStore((state) => state.refresh);
  const profile = useConnectionStore((state) => state.profile);
  const [open, setOpen] = useState(false);

  // Startup: warm the provider from the persisted profile, then reconcile
  // the chat list against the server.
  useEffect(() => {
    void purgeTemporaryChats();
    void (async () => {
      await getProvider();
      await refreshChats();
    })();
  }, [refreshChats]);

  // The header and the composer's reasoning chip read the catalog, so it is
  // kept current while the app is in front rather than when the picker opens.
  // Watching restarts with the connection, so a new server's catalog loads.
  useEffect(() => {
    if (!profile) return;
    let watch: AbortController | null = null;
    const start = () => {
      watch = new AbortController();
      void watchCatalog(watch.signal);
    };
    const stop = () => {
      watch?.abort();
      watch = null;
    };
    if (AppState.currentState === "active") start();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") stop();
      else if (!watch) start();
    });
    return () => {
      subscription.remove();
      stop();
    };
  }, [profile]);

  useEffect(() => {
    if (open) void refreshChats();
  }, [open, refreshChats]);

  // The drawer library leaves the hardware back button alone; without this,
  // back would leave the app instead of closing the sidebar.
  useEffect(() => {
    if (!open) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setOpen(false);
      return true;
    });
    return () => subscription.remove();
  }, [open]);

  const controls = useMemo(
    () => ({ openDrawer: () => setOpen(true), closeDrawer: () => setOpen(false) }),
    [],
  );

  // The library's pan activates after 5dp of horizontal travel either way,
  // which beats a native ScrollView's 8dp touch slop and would steal swipes
  // from code blocks and chips once the zone is full-width. While closed,
  // only a rightward move can open it, so let leftward ones fail and wait
  // past the slop. The vertical limit is loosened to match so a slightly
  // diagonal swipe still counts; the chat list claims clearly vertical ones
  // at its own slop.
  // Horizontal scrollers must be RNGH's ScrollView (the markdown library's
  // code block is patched for this): RNGH offers a touch to a child's
  // handlers before this pan, so an overflowing scroller claims the swipe
  // and cancels the pan. A plain ScrollView only claims after RNGH has
  // handled the event, so when one move crosses both thresholds the pan
  // wins and the sidebar opens mid-scroll.
  // The library still builds a legacy Gesture.Pan() but types the hook with
  // gesture-handler 3's new PanGesture, hence the cast.
  const configureSwipe = useCallback(
    (pan: LegacyPanGesture) =>
      open
        ? pan
        : pan
            .activeOffsetX([-OPEN_SWIPE_OFFSET, OPEN_SWIPE_OFFSET])
            .failOffsetX(-OPEN_SWIPE_OFFSET)
            .failOffsetY([-OPEN_SWIPE_OFFSET, OPEN_SWIPE_OFFSET]),
    [open],
  ) as unknown as (pan: PanGesture) => PanGesture;

  const goToChat = useCallback(
    (chatId: string) => {
      setOpen(false);
      // Replace, not push: switching chats should not build a back stack.
      if (chatId !== id) router.replace({ pathname: "/chat/[id]", params: { id: chatId } });
    },
    [id, router],
  );

  const startNewChat = useCallback(() => goToChat("new"), [goToChat]);
  const openSettings = useCallback(() => {
    setOpen(false);
    router.push("/settings");
  }, [router]);
  const openUsage = useCallback(() => {
    setOpen(false);
    router.push("/usage");
  }, [router]);

  return (
    <DrawerContext.Provider value={controls}>
      <Drawer
        open={open}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
        drawerType="front"
        // Swipe right from anywhere to open, as in ChatGPT.
        swipeEdgeWidth={width}
        configureGestureHandler={configureSwipe}
        drawerStyle={{ width: Math.min(width * 0.84, 360), backgroundColor: colors.background }}
        overlayStyle={{ backgroundColor: withAlpha(colors.overlay, 0.32) }}
        renderDrawerContent={() => (
          <ChatDrawer
            open={open}
            activeChatId={id}
            onSelectChat={goToChat}
            onNewChat={startNewChat}
            onOpenSettings={openSettings}
            onOpenUsage={openUsage}
            onDeletedActive={startNewChat}
          />
        )}
      >
        <Stack screenOptions={{ headerShown: false, animation: "fade", animationDuration: 150 }} />
      </Drawer>
    </DrawerContext.Provider>
  );
}
