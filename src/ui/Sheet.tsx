import { Modal, Pressable, View, Text, type ViewStyle } from "react-native";
import { cn } from "@/src/lib/cn";

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Height of the sheet content area. */
  height?: number | `${number}%`;
  className?: string;
  testID?: string;
}

/**
 * Bottom sheet primitive backed by the RN Modal, so it works everywhere
 * (Expo Go included) with no native module. Swap for a gesture-driven
 * sheet later if drag-to-dismiss becomes a requirement.
 */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  height = "40%",
  className,
  testID,
}: SheetProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      testID={testID}
    >
      <Pressable
        className="flex-1 justify-end bg-overlay/50"
        onPress={onClose}
        accessibilityLabel="Close sheet"
      >
        <Pressable
          className={cn(
            "rounded-t-2xl border-t border-border bg-background px-4 pb-8 pt-3",
            className,
          )}
          style={{ height } as ViewStyle}
          onPress={(event) => event.stopPropagation()}
        >
          <View
            className="mb-3 self-center rounded-full bg-border"
            style={{ width: 40, height: 4 }}
          />
          {title ? <Text className="mb-3 text-lg font-semibold text-text">{title}</Text> : null}
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
