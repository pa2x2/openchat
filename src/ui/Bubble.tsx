import { Text, View } from "react-native";
import { cn } from "@/src/lib/cn";

export interface BubbleProps {
  /** Message text. Rendered as plain text; rich/markdown rendering is not implemented yet. */
  text: string;
  /** Which side of the conversation the message belongs to. */
  role: "user" | "assistant";
  /** Optional status line shown under the text (reserved for streaming status). */
  status?: string;
  className?: string;
  testID?: string;
}

export function Bubble({ text, role, status, className, testID }: BubbleProps) {
  const isUser = role === "user";
  return (
    <View className={cn("px-3", className)} testID={testID}>
      <View
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5",
          isUser ? "self-end rounded-br-md bg-primary" : "self-start rounded-bl-md bg-surface",
        )}
      >
        <Text className={cn("text-base", isUser ? "text-primary-foreground" : "text-text")}>
          {text}
        </Text>
      </View>
      {status ? (
        <Text
          className={cn(
            "mt-1 px-1 text-xs",
            isUser ? "self-end text-primary-foreground/70" : "self-start text-text-muted",
          )}
        >
          {status}
        </Text>
      ) : null}
    </View>
  );
}
