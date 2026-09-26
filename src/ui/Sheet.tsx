import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Keyboard,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "@/src/lib/cn";
import { SeededKeyboardAvoidingView, useKeyboardOpen } from "./keyboard";
import { useAppTheme } from "./theme";

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
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
/** A drag past this distance (dp) or faster than this velocity (dp/ms) dismisses. */
const DISMISS_DISTANCE = 80;
const DISMISS_VELOCITY = 0.5;

/**
 * Bottom sheet primitive: a floating rounded card with a grabber, backed by
 * the RN Modal so it needs no native module. The scrim fades while the card
 * slides; both run on the native driver. Dragging the card down dismisses it;
 * scrollable content keeps its own vertical gestures, so lists are dismissed
 * from the grabber and title. A sheet with a field in it rises above the
 * keyboard, and takes the keyboard down when it closes.
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
  const keyboardOpen = useKeyboardOpen();
  // Stays mounted through the closing animation, then unmounts the Modal.
  // Mounting happens here rather than in the effect, so opening does not cost
  // an extra empty render.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  const [progress] = useState(() => new Animated.Value(visible ? 1 : 0));
  // Finger offset while dragging the card down; added to the open/close slide.
  const [drag] = useState(() => new Animated.Value(0));
  // Whether the sheet was open on the previous pass, so that one which mounts
  // closed is not mistaken for one on its way down.
  const wasVisible = useRef(visible);
  // The responder is built once, so it reads the latest onClose from here.
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  // Built once: a new responder mid-drag would lose its gesture state. The
  // ref is only read when a gesture ends, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [panResponder] = useState(() =>
    PanResponder.create({
      // Claim touches on the card's own surface (grabber, title, padding) and
      // take over vertical drags that start on rows. Bubble phase only, so
      // Pressables still get taps and scrolling lists keep their own drags.
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY) {
          onCloseRef.current();
          return;
        }
        Animated.spring(drag, { toValue: 0, bounciness: 0, useNativeDriver: true }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(drag, { toValue: 0, bounciness: 0, useNativeDriver: true }).start();
      },
    }),
  );

  useEffect(() => {
    const closing = wasVisible.current && !visible;
    wasVisible.current = visible;
    if (visible) {
      drag.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }
    // A closing sheet takes the keyboard down with it: the field that raised it
    // is going away, and an unmounted input leaves the keyboard up on iOS. Only
    // on the way down, never on the way in: a screen renders its sheets closed,
    // and dismissing there would take the composer down mid-sentence.
    if (closing) Keyboard.dismiss();
    Animated.timing(progress, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [visible, progress, drag]);

  // Built once: each new node would be attached to the native driver again on
  // every render of the screen that owns the sheet.
  const translateY = useMemo(
    () =>
      Animated.add(progress.interpolate({ inputRange: [0, 1], outputRange: [OFFSCREEN, 0] }), drag),
    [progress, drag],
  );
  const scrimOpacity = useMemo(
    () => progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.4] }),
    [progress],
  );

  if (!mounted) return null;

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
      <View className="flex-1">
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: colors.overlay,
              opacity: scrimOpacity,
            },
          ]}
        >
          <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Close sheet" />
        </Animated.View>
        {/* The Modal is its own window, so the screen's keyboard avoidance
            cannot reach the card: this one has to live in here. The card then
            shrinks into the space the keyboard leaves, instead of sitting
            under it. */}
        <SeededKeyboardAvoidingView
          behavior="padding"
          style={{ flex: 1, justifyContent: "flex-end" }}
        >
          <Animated.View
            {...panResponder.panHandlers}
            style={{
              transform: [{ translateY }],
              // The keyboard already covers the nav-bar inset, so it only
              // counts towards the gap while it is down.
              marginBottom: keyboardOpen ? 8 : insets.bottom + 8,
              marginHorizontal: 8,
              flexShrink: 1,
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
        </SeededKeyboardAvoidingView>
      </View>
    </Modal>
  );
}
