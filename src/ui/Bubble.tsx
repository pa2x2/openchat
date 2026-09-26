import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { cn } from "@/src/lib/cn";

export interface BubbleProps {
  /** Plain-text fallback used by the design-system demo and simple callers. */
  text?: string;
  children?: ReactNode;
  role: "user" | "assistant";
  status?: string;
  className?: string;
  testID?: string;
}

/**
 * One message. The user's side is a tinted pill on the right; the
 * assistant's side has no bubble at all and reads as page text, full width.
 */
export function Bubble({ text, children, role, status, className, testID }: BubbleProps) {
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
      {isUser ? (
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
