import { Text } from "@/src/ui/Text";
import { Pressable } from "@/src/ui/Pressable";
import { ProgressRing } from "@/src/ui/ProgressRing";
import type { PaletteKey } from "@/src/ui/theme";
import { contextShare, formatShare, formatTokensShort } from "./usageFormat";
import { useTranslation } from "react-i18next";

export interface ContextUse {
  /** Tokens the model's context holds after the latest reply. */
  tokens: number;
  /** The model's context window; unset when the backend doesn't give one. */
  window?: number;
}

/** Muted until the context is nearly full, since compaction then cuts into a reply. */
export function contextTone(share: number): PaletteKey {
  if (share >= 0.95) return "danger";
  if (share >= 0.8) return "tintAmber";
  return "textMuted";
}

/**
 * How full the model's context is, in the composer's toolbar: a ring of the
 * share in use, or the token count alone when the window is unknown.
 */
export function ContextMeter({ context, onPress }: { context: ContextUse; onPress: () => void }) {
  const { t } = useTranslation();
  const short = formatTokensShort(context.tokens);
  const share = context.window ? contextShare(context.tokens, context.window) : null;
  return (
    <Pressable
      accessibilityHint={t("context.hint")}
      accessibilityLabel={
        share === null
          ? t("context.tokens", { tokens: short })
          : t("context.used", { share: formatShare(share) })
      }
      accessibilityRole="button"
      className="h-10 min-w-10 items-center justify-center rounded-full px-1 active:bg-raised"
      onPress={onPress}
      testID="context-meter"
    >
      {share === null ? (
        <Text className="text-[12.5px] text-text-muted">{short}</Text>
      ) : (
        <ProgressRing progress={share} tone={contextTone(share)} />
      )}
    </Pressable>
  );
}
