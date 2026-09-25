import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "@/src/lib/cn";
import { useAppTheme } from "./theme";

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Muted line under the title. */
  subtitle?: string;
  children: React.ReactNode;
  /**
   * Fixed height for the sheet. Omit to size it to its content (capped so it
   * never covers the whole screen).
   */
  height?: DimensionValue;
  className?: string;
  testID?: string;
}

/** How far below the screen a closed sheet sits; larger than any sheet. */
const OFFSCREEN = 900;

/**
 * Bottom sheet primitive: a floating rounded card with a grabber, backed by
 * the RN Modal so it needs no native module. The scrim fades while the card
 * slides; both run on the native driver.
 */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  height,
  className,
  testID,
}: SheetProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  // Stays mounted through the closing animation, then unmounts the Modal.
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }
    Animated.timing(progress, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [visible, progress]);

  if (!mounted) return null;

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [OFFSCREEN, 0] });

  return (
    <Modal
      visible
      transparent
      animationType="none"
      navigationBarTranslucent
      statusBarTranslucent
      onRequestClose={onClose}
      testID={testID}
    >
      <View className="flex-1 justify-end">
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: colors.overlay,
              opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.4] }),
            },
          ]}
        >
          <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Close sheet" />
        </Animated.View>
        <Animated.View
          style={{
            transform: [{ translateY }],
            marginBottom: insets.bottom + 8,
            marginHorizontal: 8,
            maxHeight: "85%",
            height,
          }}
        >
          <View
            className={cn(
              "flex-shrink rounded-[28px] bg-elevated px-3 pb-4 pt-2",
              height !== undefined && "flex-1",
              className,
            )}
          >
            <View className="mb-3 mt-0.5 h-1 w-9 self-center rounded-full bg-border" />
            {title ? (
              <Text className="text-center text-lg font-semibold text-text">{title}</Text>
            ) : null}
            {subtitle ? (
              <Text className="mt-0.5 text-center text-sm text-text-muted">{subtitle}</Text>
            ) : null}
            {title || subtitle ? <View className="h-3" /> : null}
            {children}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
