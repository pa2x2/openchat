/**
 * Chat controls: sidebar on the left, and new chat + the overflow menu on the
 * right. On a chat not yet started, the temporary-chat toggle takes new
 * chat's place. A temporary chat says so under the title for as long as it
 * lasts, since leaving it deletes it.
 *
 * Where they sit is a setting. At the top there is no bar, just raised
 * buttons over a fade, so the transcript scrolls underneath, and the chat's
 * title sits between them. At the bottom they are a flat row under the
 * composer, within reach of the thumb. The title needs no reaching, so it
 * stays at the top in `ChatTitleBar`, where it has the screen's width and
 * does not leave with the row when the keyboard opens.
 */

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Text } from "@/src/ui/Text";
import { Menu, type MenuItem } from "@/src/ui/Menu";
import { Pressable } from "@/src/ui/Pressable";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "@/src/lib/cn";
import type { ChatControls } from "@/src/stores/settings";
import { Icon, MenuGlyph, TemporaryChatGlyph } from "@/src/ui/Icon";
import { useAppTheme, withAlpha } from "@/src/ui/theme";

/** Height of the top header below the status bar; the transcript pads by this. */
export const HEADER_HEIGHT = 60;

/** Height of `ChatTitleBar` below the status bar: two lines of the title. */
export const TITLE_BAR_HEIGHT = 40;

/** Gap between the bottom row and the menu that opens above it. */
const MENU_GAP = 8;

export interface ChatHeaderProps {
  placement: ChatControls;
  onOpenDrawer: () => void;
  onNewChat: () => void;
  /** Null until the chat has a name. Shown only at the top. */
  title: string | null;
  menuItems: MenuItem[];
  /** Present on a chat not yet started; replaces the new chat button. */
  temporary?: { on: boolean; onToggle: () => void };
  temporaryLabel?: boolean;
}

export function ChatHeader({
  placement,
  onOpenDrawer,
  onNewChat,
  title,
  menuItems,
  temporary,
  temporaryLabel = false,
}: ChatHeaderProps) {
  const insets = useSafeAreaInsets();
  const { colors, floatingShadow } = useAppTheme();
  const top = placement === "top";
  const { t } = useTranslation();
  const row = useRef<View>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // Screen y the menu hangs from. The bottom row is measured when the menu
  // opens: the row moves with the composer, which grows as the user types.
  const [menuY, setMenuY] = useState(0);
  const [titleLines, setTitleLines] = useState(1);
  // A title on two lines, or with the label under it, reaches down into the
  // fade, where the transcript's text would show through it. The solid part
  // grows to hold it.
  const solid = titleLines > 1 || temporaryLabel ? 1 - 16 / (insets.top + HEADER_HEIGHT) : 0.65;

  function openMenu() {
    if (top) {
      setMenuY(insets.top + HEADER_HEIGHT - 4);
      setMenuOpen(true);
      return;
    }
    row.current?.measureInWindow((_x, y) => {
      // No room below the row, so the menu flips and ends here.
      setMenuY(y - MENU_GAP);
      setMenuOpen(true);
    });
  }

  const action = cn(
    "h-11 items-center justify-center rounded-full",
    top ? "w-10 active:opacity-60" : "w-11 active:bg-surface",
  );

  const actions = (
    <>
      {temporary ? (
        <Pressable
          accessibilityLabel={t("chat.temporary")}
          accessibilityRole="switch"
          accessibilityState={{ checked: temporary.on }}
          className={action}
          haptic={temporary.on ? "toggle-off" : "toggle-on"}
          onPress={temporary.onToggle}
          testID="temporary-chat"
        >
          <TemporaryChatGlyph on={temporary.on} background={top ? "elevated" : "background"} />
        </Pressable>
      ) : (
        <Pressable
          accessibilityLabel={t("chat.newChat")}
          accessibilityRole="button"
          className={action}
          onPress={onNewChat}
          testID="new-chat"
        >
          <Icon name="square-edit-outline" size={21} />
        </Pressable>
      )}
      {menuItems.length > 0 ? (
        <Pressable
          accessibilityLabel={t("chat.moreOptions")}
          accessibilityRole="button"
          className={action}
          onPress={openMenu}
          testID="chat-menu"
        >
          <Icon name="dots-horizontal" size={22} />
        </Pressable>
      ) : null}
    </>
  );

  return (
    <View
      ref={row}
      // Flattened away, a view cannot be measured.
      collapsable={false}
      pointerEvents="box-none"
      className={cn(
        "flex-row items-center justify-between",
        top ? "absolute left-0 right-0 top-0 px-3" : "-mx-1 mt-1.5",
      )}
      style={
        top
          ? {
              paddingTop: insets.top + 6,
              paddingBottom: 14,
              experimental_backgroundImage: `linear-gradient(to bottom, ${colors.background} ${Math.round(solid * 100)}%, ${withAlpha(colors.background, 0)})`,
            }
          : undefined
      }
    >
      <Pressable
        accessibilityLabel={t("chat.openSidebar")}
        accessibilityRole="button"
        className={cn(
          "h-11 w-11 items-center justify-center rounded-full",
          top ? "bg-elevated active:opacity-80" : "active:bg-surface",
        )}
        style={top ? { boxShadow: floatingShadow } : undefined}
        onPress={onOpenDrawer}
        testID="open-drawer"
      >
        <MenuGlyph />
      </Pressable>

      {top ? (
        <View
          // A drag that starts on the title still scrolls the transcript under it.
          pointerEvents="none"
          // Centred on the screen, not between the buttons, which differ in
          // width; the padding clears the wider side.
          className="absolute bottom-0 left-0 right-0 h-[72px] items-center justify-center px-[108px]"
        >
          <ChatTitle title={title} temporaryLabel={temporaryLabel} onLines={setTitleLines} />
        </View>
      ) : null}

      {top ? (
        <View
          className="h-11 flex-row items-center rounded-full bg-elevated px-1"
          style={{ boxShadow: floatingShadow }}
        >
          {actions}
        </View>
      ) : (
        <View className="flex-row items-center">{actions}</View>
      )}

      <Menu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={menuItems}
        anchor={{ y: menuY, side: "right", inset: 12 }}
        testID="chat-menu-popover"
      />
    </View>
  );
}

/** Space under `ChatTitleBar` over which the transcript fades out. */
const TITLE_BAR_FADE = 12;

/**
 * With the controls at the bottom, what is left of the header: the chat's
 * title over a fade that keeps the transcript from running under it and the
 * status bar's icons.
 */
export function ChatTitleBar({
  title,
  temporaryLabel = false,
  onRename,
}: {
  /** Null until the chat has a name. */
  title: string | null;
  temporaryLabel?: boolean;
  /** Present on a chat that can be renamed; a tap on the title calls it. */
  onRename?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const solid = insets.top + TITLE_BAR_HEIGHT;
  return (
    <View
      // Only the title takes a touch; a drag from anywhere else on the bar
      // scrolls the transcript.
      pointerEvents="box-none"
      className="absolute left-0 right-0 top-0 items-center justify-center px-4"
      style={{
        height: solid + TITLE_BAR_FADE,
        paddingTop: insets.top,
        paddingBottom: TITLE_BAR_FADE,
        experimental_backgroundImage: `linear-gradient(to bottom, ${colors.background} ${Math.round((solid / (solid + TITLE_BAR_FADE)) * 100)}%, ${withAlpha(colors.background, 0)})`,
      }}
    >
      <ChatTitle title={title} temporaryLabel={temporaryLabel} onPress={onRename} />
    </View>
  );
}

function ChatTitle({
  title,
  temporaryLabel,
  onPress,
  onLines,
}: {
  title: string | null;
  temporaryLabel: boolean;
  onPress?: () => void;
  onLines?: (lines: number) => void;
}) {
  const { t } = useTranslation();
  const shown = title ?? t("chat.newChat");
  return (
    <Pressable
      accessibilityHint={onPress ? t("chat.renameHint") : undefined}
      accessibilityLabel={temporaryLabel ? t("chat.titleTemporary", { title: shown }) : shown}
      accessibilityRole={onPress ? "button" : "header"}
      className="items-center active:opacity-60"
      hitSlop={10}
      // Where a tap does nothing, a drag that starts on the title scrolls the
      // transcript under it.
      pointerEvents={onPress ? "auto" : "none"}
      onPress={onPress}
      testID="chat-title"
    >
      <Text
        className={cn(
          "text-center text-[15px] font-medium leading-[18px]",
          title === null && "text-text-muted",
        )}
        // The label takes the second line's place.
        numberOfLines={temporaryLabel ? 1 : 2}
        onTextLayout={onLines && ((event) => onLines(event.nativeEvent.lines.length))}
      >
        {shown}
      </Text>
      {temporaryLabel ? (
        <View className="flex-row items-center gap-1" testID="temporary-label">
          <TemporaryChatGlyph on size={12} tone="textMuted" background="background" />
          <Text className="text-xs text-text-muted">{t("chat.temporary")}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
