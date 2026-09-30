/**
 * Chat usage sheet: how full the model's context is, and everything the chat
 * has used as the backend counts it. Each part shows only what the backend
 * sent, and a part with nothing is left out.
 */

import { View } from "react-native";
import type { Money, TokenUsage } from "@/src/domain";
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
  const { colors } = useAppTheme();
  const used = formatTokensShort(context.tokens);
  if (!context.window) {
    return (
      <Group className="bg-raised">
        <View className="min-h-[42px] justify-center px-4">
          <Text className="text-[15px] text-text">{used} tokens</Text>
        </View>
      </Group>
    );
  }
  const share = contextShare(context.tokens, context.window);
  return (
    <Group className="bg-raised">
      <View
        accessible
        accessibilityLabel={`${used} of ${formatTokensShort(context.window)} tokens, ${formatShare(share)}`}
        className="px-4 pb-3.5 pt-3"
      >
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-[15px] text-text">
            {used} of {formatTokensShort(context.window)} tokens
          </Text>
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

export function UsageSheet({ visible, onClose, context, usage, cost }: UsageSheetProps) {
  const costText = formatCost(cost);
  const totals: Figure[] = [
    ...tokenFigures(usage),
    ...(costText ? [{ label: "Cost", value: costText }] : []),
  ];
  return (
    <Sheet visible={visible} onClose={onClose} title="Chat usage" testID="usage-sheet">
      {context ? (
        <>
          <GroupLabel>Context</GroupLabel>
          <ContextCard context={context} />
        </>
      ) : null}
      {totals.length > 0 ? (
        <>
          <GroupLabel>Everything this chat used</GroupLabel>
          <Group className="bg-raised" testID="usage-totals">
            {totals.map((figure) => (
              <FigureRow key={figure.label} {...figure} />
            ))}
          </Group>
          <Text className="px-3 pt-2 text-[12.5px] leading-[17px] text-text-muted">
            Counts naming the chat and replies you regenerated, so it can be more than the chat’s
            replies add up to.
          </Text>
        </>
      ) : null}
    </Sheet>
  );
}
