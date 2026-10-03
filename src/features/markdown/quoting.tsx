/**
 * What a message hands down to the markdown it renders: whether its text
 * offers Quote, and which words to light up. The message provides both once;
 * the paragraphs and code blocks under it read them, however deep.
 */

import { createContext, use, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { StyleProp, View, ViewStyle } from "react-native";
import { Quotable } from "@/modules/text-actions";

/** `code` is the code block's language, or "" for none; unset outside code. */
export type QuoteHandler = (text: string, code?: string) => void;

export const QuoteScope = createContext<QuoteHandler | null>(null);

export interface Highlight {
  text: string;
  /** Told where the lit words are drawn, once they are. */
  onShown?: (view: View) => void;
}

export const HighlightScope = createContext<Highlight | null>(null);

export function QuoteTarget({
  code,
  style,
  children,
}: {
  code?: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const onQuote = use(QuoteScope);
  return (
    <Quotable
      label={t("quote.action")}
      onQuote={onQuote ? (text) => onQuote(text, code) : undefined}
      style={style}
    >
      {children}
    </Quotable>
  );
}
