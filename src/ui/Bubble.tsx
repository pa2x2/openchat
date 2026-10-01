import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { View, type GestureResponderEvent } from "react-native";
import { Pressable } from "./Pressable";
import { Text } from "./Text";
import { cn } from "@/src/lib/cn";

export interface BubbleProps {
  /** Plain-text fallback used by the design-system demo and simple callers. */
  text?: string;
  children?: ReactNode;
  role: "user" | "assistant";
  status?: string;
  /** The user's side only: a long press on the bubble itself. */
  onLongPress?: (event: GestureResponderEvent) => void;
  className?: string;
  testID?: string;
}

/**
 * One message. The user's side is a tinted pill on the right; the
 * assistant's side has no bubble at all and reads as page text, full width.
 */
export function Bubble({
  text,
  children,
  role,
  status,
  onLongPress,
  className,
  testID,
}: BubbleProps) {
  const { t } = useTranslation();
  const isUser = role === "user";
  const content =
    children ??
    (text !== undefined ? (
      <Text
        className={cn("text-base leading-[23px]", isUser ? "text-user-bubble-text" : "text-text")}
      >
        {text}
      </Text>
    ) : null);

  return (
    <View className={cn("px-4", className)} testID={testID}>
      {isUser && onLongPress ? (
        <Pressable
          accessibilityHint={t("message.menuHint")}
          className="max-w-[82%] self-end rounded-[22px] bg-user-bubble px-4 py-2.5 active:opacity-80"
          onLongPress={onLongPress}
        >
          {content}
        </Pressable>
      ) : isUser ? (
        <View className="max-w-[82%] self-end rounded-[22px] bg-user-bubble px-4 py-2.5">
          {content}
        </View>
      ) : (
        <View className="w-full">{content}</View>
      )}
      {status ? (
        <Text
          accessibilityLabel={status}
          className={cn("mt-1 px-1 text-xs text-text-muted", isUser ? "self-end" : "self-start")}
        >
          {status}
        </Text>
      ) : null}
    </View>
  );
}
