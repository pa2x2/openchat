import { useCallback, useEffect, useMemo, useState } from "react";
import { BackHandler, useWindowDimensions } from "react-native";
import { Stack, useGlobalSearchParams, useRouter } from "expo-router";
import { Drawer } from "react-native-drawer-layout";
import { ChatDrawer } from "@/src/features/drawer/ChatDrawer";
import { DrawerContext } from "@/src/features/drawer/DrawerContext";
import { getProvider } from "@/src/lib/providerFactory";
import { useChatsStore } from "@/src/stores/chats";
import { useAppTheme, withAlpha } from "@/src/ui/theme";

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
  const [open, setOpen] = useState(false);

  // Startup: warm the provider from the persisted profile, then reconcile
  // the chat list against the server.
  useEffect(() => {
    void (async () => {
      await getProvider();
      await refreshChats();
    })();
  }, [refreshChats]);

  // Keep the list fresh whenever the sidebar is opened.
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

  const goToChat = useCallback(
    (chatId: string) => {
      setOpen(false);
      // Replace, not push: switching chats should not build a back stack.
      if (chatId !== id) router.replace({ pathname: "/chat/[id]", params: { id: chatId } });
    },
    [id, router],
  );

  return (
    <DrawerContext.Provider value={controls}>
      <Drawer
        open={open}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
        drawerType="front"
        // The pan claims horizontal moves in both directions inside this zone,
        // so a full-width zone would steal swipes from code blocks, tables and
        // the suggestion chips. A fifth of the screen clears Android's back
        // gesture strip while leaving the rest to horizontal scrollers.
        swipeEdgeWidth={width * 0.2}
        drawerStyle={{ width: Math.min(width * 0.84, 360), backgroundColor: colors.background }}
        overlayStyle={{ backgroundColor: withAlpha(colors.overlay, 0.32) }}
        renderDrawerContent={() => (
          <ChatDrawer
            activeChatId={id}
            onSelectChat={goToChat}
            onNewChat={() => goToChat("new")}
            onOpenSettings={() => {
              setOpen(false);
              router.push("/settings");
            }}
            onDeletedActive={() => goToChat("new")}
          />
        )}
      >
        <Stack screenOptions={{ headerShown: false, animation: "fade", animationDuration: 150 }} />
      </Drawer>
    </DrawerContext.Provider>
  );
}
