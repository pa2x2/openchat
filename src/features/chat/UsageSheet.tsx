/**
 * Chat usage sheet: how full the model's context is, and everything the chat
 * has used as the backend counts it. Each part shows only what the backend
 * sent, and a part with nothing is left out.
 */

import { useTranslation } from "react-i18next";
import { View } from "react-native";
import type { Money, TokenUsage } from "@/src/domain";
import { Button } from "@/src/ui/Button";
import { Group, GroupLabel } from "@/src/ui/ListGroup";
import { Sheet } from "@/src/ui/Sheet";
import { Text } from "@/src/ui/Text";
import { useAppTheme } from "@/src/ui/theme";
import { contextTone, type ContextUse } from "./ContextMeter";
import {
  contextShare,
  formatCost,
  formatShare,
  formatTokensShort,
  tokenFigures,
  type Figure,
} from "./usageFormat";

export interface UsageSheetProps {
  visible: boolean;
  onClose: () => void;
  context: ContextUse | null;
  usage?: TokenUsage;
  cost?: Money;
  /** Offered only once the context meter warns; unset when compacting isn't possible now. */
  onCompact?: () => void;
}

function FigureRow({ label, value }: Figure) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      className="min-h-[42px] flex-row items-center justify-between gap-3 px-4"
    >
      <Text className="text-[15px] text-text">{label}</Text>
      <Text className="text-[15px] font-medium tabular-nums text-text">{value}</Text>
    </View>
  );
}

function ContextCard({ context }: { context: ContextUse }) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const used = formatTokensShort(context.tokens);
  if (!context.window) {
    return (
      <Group className="bg-raised">
        <View className="min-h-[42px] justify-center px-4">
          <Text className="text-[15px] text-text">{t("context.tokenCount", { tokens: used })}</Text>
        </View>
      </Group>
    );
  }
  const share = contextShare(context.tokens, context.window);
  const usedOf = t("context.tokensOf", { used, window: formatTokensShort(context.window) });
  return (
    <Group className="bg-raised">
      <View
        accessible
        accessibilityLabel={`${usedOf}, ${formatShare(share)}`}
        className="px-4 pb-3.5 pt-3"
      >
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-[15px] text-text">{usedOf}</Text>
          <Text className="text-[15px] font-medium tabular-nums text-text">
            {formatShare(share)}
          </Text>
        </View>
        <View className="mt-2.5 h-[5px] overflow-hidden rounded-full bg-raised-hover">
          <View
            className="h-full rounded-full"
            style={{ width: `${share * 100}%`, backgroundColor: colors[contextTone(share)] }}
          />
        </View>
      </View>
    </Group>
  );
}

export function UsageSheet({ visible, onClose, context, usage, cost, onCompact }: UsageSheetProps) {
  const { t } = useTranslation();
  const nearlyFull =
    context?.window !== undefined &&
    contextTone(contextShare(context.tokens, context.window)) !== "textMuted";
  const costText = formatCost(cost);
  const totals: Figure[] = [
    ...tokenFigures(usage),
    ...(costText ? [{ label: t("usage.figures.cost"), value: costText }] : []),
  ];
  return (
    <Sheet visible={visible} onClose={onClose} title={t("usage.sheet.title")} testID="usage-sheet">
      {context ? (
        <>
          <GroupLabel>{t("usage.sheet.context")}</GroupLabel>
          <ContextCard context={context} />
          {onCompact && nearlyFull ? (
            <View className="items-start gap-2.5 px-3 pt-2">
              <Text className="text-[12.5px] leading-[17px] text-text-muted">
                {t("context.compactNote")}
              </Text>
              <Button
                label={t("context.compact")}
                onPress={onCompact}
                variant="secondary"
                size="sm"
                testID="usage-compact"
              />
            </View>
          ) : null}
        </>
      ) : null}
      {totals.length > 0 ? (
        <>
          <GroupLabel>{t("usage.sheet.totals")}</GroupLabel>
          <Group className="bg-raised" testID="usage-totals">
            {totals.map((figure) => (
              <FigureRow key={figure.label} {...figure} />
            ))}
          </Group>
          <Text className="px-3 pt-2 text-[12.5px] leading-[17px] text-text-muted">
            {t("usage.sheet.totalsNote")}
          </Text>
        </>
      ) : null}
    </Sheet>
  );
}
