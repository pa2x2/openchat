/**
 * Floating chat header: no bar, just raised buttons over a fade, so the
 * transcript scrolls underneath. Sidebar on the left, the model picker in
 * the middle, and new chat + the overflow menu grouped on the right.
 */

import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "@/src/lib/cn";
import { Icon, MenuGlyph, type IconName } from "@/src/ui/Icon";
import { useAppTheme, withAlpha } from "@/src/ui/theme";

/** Height of the header below the status bar; the transcript pads by this. */
export const HEADER_HEIGHT = 60;

export interface HeaderMenuItem {
  label: string;
  icon: IconName;
  onPress: () => void;
  destructive?: boolean;
  testID?: string;
}

export interface ChatHeaderProps {
  onOpenDrawer: () => void;
  onNewChat: () => void;
  /** Title in the middle. With `onPressTitle` it is the model picker. */
  title: string;
  onPressTitle?: () => void;
  menuItems: HeaderMenuItem[];
}

export function ChatHeader({
  onOpenDrawer,
  onNewChat,
  title,
  onPressTitle,
  menuItems,
}: ChatHeaderProps) {
  const insets = useSafeAreaInsets();
  const { colors, floatingShadow } = useAppTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <View
      pointerEvents="box-none"
      className="absolute left-0 right-0 top-0 flex-row items-center justify-between px-3"
      style={{
        paddingTop: insets.top + 6,
        paddingBottom: 14,
        experimental_backgroundImage: `linear-gradient(to bottom, ${colors.background} 65%, ${withAlpha(colors.background, 0)})`,
      }}
    >
      <Pressable
        accessibilityLabel="Open sidebar"
        accessibilityRole="button"
        className="h-11 w-11 items-center justify-center rounded-full bg-elevated active:opacity-80"
        style={{ boxShadow: floatingShadow }}
        onPress={onOpenDrawer}
        testID="open-drawer"
      >
        <MenuGlyph />
      </Pressable>

      <Pressable
        accessibilityLabel={onPressTitle ? `Model: ${title}. Choose model` : title}
        accessibilityRole={onPressTitle ? "button" : "header"}
        className={cn(
          "mx-2 h-10 max-w-[55%] flex-row items-center gap-1 rounded-full pl-3.5 pr-2.5",
          onPressTitle && "active:bg-surface",
        )}
        disabled={!onPressTitle}
        onPress={onPressTitle}
        testID="model-button"
      >
        <Text className="text-[17px] font-medium text-text" numberOfLines={1}>
          {title}
        </Text>
        {onPressTitle ? <Icon name="chevron-down" size={18} tone="textMuted" /> : null}
      </Pressable>

      <View
        className="h-11 flex-row items-center rounded-full bg-elevated px-1"
        style={{ boxShadow: floatingShadow }}
      >
        <Pressable
          accessibilityLabel="New chat"
          accessibilityRole="button"
          className="h-11 w-10 items-center justify-center rounded-full active:opacity-60"
          onPress={onNewChat}
          testID="new-chat"
        >
          <Icon name="square-edit-outline" size={21} />
        </Pressable>
        {menuItems.length > 0 ? (
          <Pressable
            accessibilityLabel="More options"
            accessibilityRole="button"
            className="h-11 w-10 items-center justify-center rounded-full active:opacity-60"
            onPress={() => setMenuOpen(true)}
            testID="chat-menu"
          >
            <Icon name="dots-horizontal" size={22} />
          </Pressable>
        ) : null}
      </View>

      <HeaderMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={menuItems}
        top={insets.top + HEADER_HEIGHT - 4}
      />
    </View>
  );
}

function HeaderMenu({
  visible,
  onClose,
  items,
  top,
}: {
  visible: boolean;
  onClose: () => void;
  items: HeaderMenuItem[];
  top: number;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      navigationBarTranslucent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Close menu">
        <View
          className="absolute right-3 min-w-[220px] rounded-[20px] bg-elevated p-1.5"
          style={{ top, boxShadow: "0px 8px 32px rgba(0, 0, 0, 0.22)" }}
          testID="chat-menu-popover"
        >
          {items.map((item) => (
            <Pressable
              key={item.label}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              className="flex-row items-center gap-3 rounded-[14px] px-3 py-3 active:bg-surface"
              onPress={() => {
                onClose();
                item.onPress();
              }}
              testID={item.testID}
            >
              <Icon name={item.icon} size={20} tone={item.destructive ? "danger" : "text"} />
              <Text className={cn("text-[15.5px]", item.destructive ? "text-danger" : "text-text")}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}
