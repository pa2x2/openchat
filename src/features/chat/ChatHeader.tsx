/**
 * Floating chat header: no bar, just raised buttons over a fade, so the
 * transcript scrolls underneath. Sidebar on the left, the model picker in
 * the middle, and new chat + the overflow menu grouped on the right. On a
 * chat not yet started, the temporary-chat toggle takes new chat's place.
 * A temporary chat says so under the title for as long as it lasts, since
 * leaving it deletes it.
 */

import { useState } from "react";
import { View } from "react-native";
import { Text } from "@/src/ui/Text";
import { Menu, type MenuItem } from "@/src/ui/Menu";
import { Pressable } from "@/src/ui/Pressable";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "@/src/lib/cn";
import { Icon, MenuGlyph, TemporaryChatGlyph } from "@/src/ui/Icon";
import { Skeleton, SkeletonGroup } from "@/src/ui/Skeleton";
import { Spinner } from "@/src/ui/Spinner";
import { useAppTheme, withAlpha } from "@/src/ui/theme";

/** Height of the header below the status bar; the transcript pads by this. */
export const HEADER_HEIGHT = 60;

export interface ChatHeaderProps {
  onOpenDrawer: () => void;
  onNewChat: () => void;
  /** Title in the middle. With `onPressTitle` it is the model picker. */
  title: string;
  onPressTitle?: () => void;
  /**
   * "placeholder" stands in for a title still loading; "busy" keeps the
   * title but shows a request for it is in flight.
   */
  titleStatus?: "placeholder" | "busy";
  menuItems: MenuItem[];
  /** Present on a chat not yet started; replaces the new chat button. */
  temporary?: { on: boolean; onToggle: () => void };
  temporaryLabel?: boolean;
}

export function ChatHeader({
  onOpenDrawer,
  onNewChat,
  title,
  onPressTitle,
  titleStatus,
  menuItems,
  temporary,
  temporaryLabel = false,
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
        accessibilityLabel={[
          onPressTitle ? `Model: ${title}. Choose model` : title,
          temporaryLabel ? "Temporary chat" : null,
        ]
          .filter(Boolean)
          .join(". ")}
        accessibilityRole={onPressTitle ? "button" : "header"}
        className={cn(
          "mx-2 max-w-[55%] items-center justify-center rounded-full pl-3.5 pr-2.5",
          temporaryLabel ? "h-11" : "h-10",
          onPressTitle && "active:bg-surface",
        )}
        disabled={!onPressTitle}
        onPress={onPressTitle}
        testID="model-button"
      >
        <View className="flex-row items-center gap-1">
          {titleStatus === "placeholder" ? (
            <SkeletonGroup label="Loading model" testID="model-button-skeleton">
              <Skeleton className="h-4 w-28" />
            </SkeletonGroup>
          ) : (
            <Text className="shrink text-[17px] font-medium text-text" numberOfLines={1}>
              {title}
            </Text>
          )}
          {titleStatus === "busy" ? (
            <View className="ml-1">
              <Spinner size="small" />
            </View>
          ) : onPressTitle ? (
            <Icon name="chevron-down" size={18} tone="textMuted" />
          ) : null}
        </View>
        {temporaryLabel ? (
          <View className="flex-row items-center gap-1" testID="temporary-label">
            <TemporaryChatGlyph on size={12} tone="textMuted" background="background" />
            <Text className="text-xs text-text-muted">Temporary chat</Text>
          </View>
        ) : null}
      </Pressable>

      <View
        className="h-11 flex-row items-center rounded-full bg-elevated px-1"
        style={{ boxShadow: floatingShadow }}
      >
        {temporary ? (
          <Pressable
            accessibilityLabel="Temporary chat"
            accessibilityRole="switch"
            accessibilityState={{ checked: temporary.on }}
            className="h-11 w-10 items-center justify-center rounded-full active:opacity-60"
            haptic={temporary.on ? "toggle-off" : "toggle-on"}
            onPress={temporary.onToggle}
            testID="temporary-chat"
          >
            <TemporaryChatGlyph on={temporary.on} />
          </Pressable>
        ) : (
          <Pressable
            accessibilityLabel="New chat"
            accessibilityRole="button"
            className="h-11 w-10 items-center justify-center rounded-full active:opacity-60"
            onPress={onNewChat}
            testID="new-chat"
          >
            <Icon name="square-edit-outline" size={21} />
          </Pressable>
        )}
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

      <Menu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={menuItems}
        anchor={{ y: insets.top + HEADER_HEIGHT - 4, side: "right", inset: 12 }}
        testID="chat-menu-popover"
      />
    </View>
  );
}
