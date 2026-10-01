import { AppState, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "@/src/lib/cn";
import { Icon, type IconName } from "./Icon";
import { Modal } from "./Modal";
import { Pressable } from "./Pressable";
import { Text } from "./Text";
import { useTranslation } from "react-i18next";

export interface MenuItem {
  label: string;
  icon: IconName;
  onPress: () => void;
  destructive?: boolean;
  testID?: string;
}

export interface MenuAnchor {
  /** Screen y the menu hangs from; it flips above when there is no room below. */
  y: number;
  side: "left" | "right";
  /** Distance from that side of the screen. */
  inset: number;
}

// Estimated rather than measured, so the menu opens in place instead of
// jumping once its size is known.
const ITEM_HEIGHT = 47;
const MENU_PADDING = 12;
const EDGE_MARGIN = 16;
/** Longest wait for the menu's window to go before the chosen item runs anyway. */
const CLOSE_TIMEOUT_MS = 400;

/**
 * Runs `action` once the app window has focus back from the menu's own. The
 * Modal is a separate Android window: an item that focuses a field (edit)
 * or opens another Modal while the menu's window is still closing would lose
 * the keyboard or the new window's focus to it. AppState reports "focus"
 * when the app window gets it back.
 */
function afterClose(action: () => void) {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    subscription.remove();
    clearTimeout(timeout);
    action();
  };
  const subscription = AppState.addEventListener("focus", run);
  const timeout = setTimeout(run, CLOSE_TIMEOUT_MS);
}

/**
 * Popover menu over a transparent backdrop; a tap outside or back closes it.
 * Choosing an item closes the menu, and the item runs once it is gone.
 */
export function Menu({
  visible,
  onClose,
  items,
  anchor,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  items: MenuItem[];
  anchor: MenuAnchor;
  testID?: string;
}) {
  const { t } = useTranslation();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const menuHeight = items.length * ITEM_HEIGHT + MENU_PADDING;
  const fitsBelow = anchor.y + menuHeight <= height - insets.bottom - EDGE_MARGIN;
  const top = fitsBelow ? anchor.y : Math.max(insets.top + EDGE_MARGIN, anchor.y - menuHeight);

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1" onPress={onClose} accessibilityLabel={t("common.closeMenu")}>
        <View
          className="absolute min-w-[220px] rounded-[20px] bg-elevated p-1.5"
          style={{
            top,
            [anchor.side]: anchor.inset,
            boxShadow: "0px 8px 32px rgba(0, 0, 0, 0.22)",
          }}
          testID={testID}
        >
          {items.map((item) => (
            <Pressable
              key={item.label}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              className="flex-row items-center gap-3 rounded-[14px] px-3 py-3 active:bg-raised"
              onPress={() => {
                onClose();
                afterClose(item.onPress);
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
