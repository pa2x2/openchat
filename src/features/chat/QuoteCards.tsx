import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import type { Quote } from "@/src/domain";
import { MONOSPACE } from "@/src/features/markdown/styles";
import { Icon } from "@/src/ui/Icon";
import { Pressable } from "@/src/ui/Pressable";
import { Text } from "@/src/ui/Text";
import { TextInput, type TextInputHandle } from "@/src/ui/TextInput";

// About three cards; more scroll inside the composer, so the field stays in view.
const MAX_CARDS_HEIGHT = 190;

/**
 * Keys that stay with a quote while its comment changes and while cards
 * before it go: a card holds its comment's field, and a typed-in field must
 * not pass to the next quote.
 */
function cardKeys(quotes: readonly Quote[]): string[] {
  const seen = new Map<string, number>();
  return quotes.map((quote) => {
    const words = `${quote.messageId}\n${quote.text}`;
    const count = seen.get(words) ?? 0;
    seen.set(words, count + 1);
    return `${words}\n${count}`;
  });
}

/**
 * The quotes staged for the next message, each with its comment typed right
 * in the card. `focused` is the card whose comment has the cursor; a card
 * that appears while it is the focused one takes the cursor.
 */
export function QuoteCards({
  quotes,
  focused,
  onFocus,
  onBlur,
  onComment,
  onRemove,
}: {
  quotes: readonly Quote[];
  focused: number | null;
  onFocus: (index: number) => void;
  onBlur: (index: number) => void;
  onComment: (index: number, comment: string) => void;
  onRemove: (index: number) => void;
}) {
  const keys = cardKeys(quotes);
  const scroll = useRef<ScrollView>(null);
  return (
    <ScrollView
      ref={scroll}
      // A new quote comes last, and its comment grows as it is typed: keep
      // it in view under the cards above it.
      onContentSizeChange={() => {
        if (focused === quotes.length - 1) scroll.current?.scrollToEnd();
      }}
      style={{ maxHeight: MAX_CARDS_HEIGHT, flexGrow: 0 }}
      contentContainerClassName="gap-1.5 px-1.5 pt-1.5"
      keyboardShouldPersistTaps="handled"
      testID="composer-quotes"
    >
      {quotes.map((quote, index) => (
        <QuoteCard
          key={keys[index]}
          quote={quote}
          autoFocus={index === focused}
          onFocus={() => onFocus(index)}
          onBlur={() => onBlur(index)}
          onComment={(comment) => onComment(index, comment)}
          onRemove={() => onRemove(index)}
        />
      ))}
    </ScrollView>
  );
}

function QuoteCard({
  quote,
  autoFocus,
  onFocus,
  onBlur,
  onComment,
  onRemove,
}: {
  quote: Quote;
  autoFocus: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onComment: (comment: string) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const input = useRef<TextInputHandle>(null);
  return (
    <View
      className="flex-row items-start gap-2 rounded-[20px] bg-raised py-2 pl-3 pr-1"
      testID="composer-quote"
    >
      <View className="pt-px">
        <Icon name="format-quote-open" size={18} tone="textMuted" />
      </View>
      <View className="flex-1">
        <Pressable
          accessibilityLabel={t("quote.card", { text: quote.text })}
          onPress={() => input.current?.focus()}
        >
          <Text
            className="text-[14px] leading-[19px] text-text-muted"
            numberOfLines={2}
            style={quote.code !== undefined ? { fontFamily: MONOSPACE, fontSize: 13 } : undefined}
          >
            {quote.text}
          </Text>
        </Pressable>
        <TextInput
          ref={input}
          accessibilityLabel={t("quote.comment")}
          autoFocus={autoFocus}
          className="max-h-24 px-0 pb-0 pt-1 text-[15px] leading-[21px]"
          multiline
          onBlur={onBlur}
          onChangeText={onComment}
          onFocus={onFocus}
          placeholder={t("quote.commentPlaceholder")}
          testID="composer-quote-comment"
          value={quote.comment ?? ""}
        />
      </View>
      <Pressable
        accessibilityLabel={t("quote.remove")}
        accessibilityRole="button"
        className="h-7 w-7 items-center justify-center rounded-full active:bg-raised-hover"
        hitSlop={6}
        onPress={onRemove}
        testID="composer-quote-remove"
      >
        <Icon name="close" size={17} />
      </Pressable>
    </View>
  );
}
