import { useTranslation } from "react-i18next";
import { View } from "react-native";
import type { Message, ModelInfo } from "@/src/domain";
import { formatNumber } from "@/src/i18n/format";
import { t } from "@/src/i18n";
import { sameModelRef, useModelsStore } from "@/src/stores/models";
import { Text } from "@/src/ui/Text";
import { formatCost, formatModelTime, tokenFigures, type Figure } from "./usageFormat";
import { formatDuration } from "./replyLayout";

/** The model's name with the variant it ran with; its id when the catalog no longer lists it. */
function modelLabel(message: Message, models: ModelInfo[]): string | null {
  const ref = message.model;
  if (!ref) return null;
  const info = models.find((model) => sameModelRef(model.ref, ref));
  const variant = ref.variant
    ? (info?.variants?.find((each) => each.id === ref.variant)?.label ?? ref.variant)
    : null;
  return [info?.label ?? ref.id, variant].filter(Boolean).join(" · ");
}

/** A reply's figures in the order the card lists them; one the backend did not send is left out. */
export function replyFigures(message: Message, models: ModelInfo[]): Figure[] {
  const figures: Figure[] = [];
  const model = modelLabel(message, models);
  if (model) figures.push({ label: t("usage.figures.model"), value: model });

  const { generationMs, completedAt, createdAt, usage } = message;
  if (generationMs !== undefined) {
    // The whole is what "Worked for" shows, so the two read as part and total.
    const part = formatModelTime(generationMs);
    figures.push({
      label: t("usage.figures.modelTime"),
      value:
        completedAt !== undefined
          ? t("usage.figures.modelTimeOf", {
              part,
              whole: formatDuration(completedAt - createdAt),
            })
          : part,
    });
    const output = usage?.output ?? 0;
    if (generationMs > 0 && output > 0) {
      const speed = output / (generationMs / 1_000);
      figures.push({
        label: t("usage.figures.speed"),
        value: t("usage.figures.speedValue", {
          speed: speed < 10 ? formatNumber(speed, 1) : formatNumber(speed),
        }),
      });
    }
  }

  const cost = formatCost(message.cost);
  if (cost) figures.push({ label: t("usage.figures.cost"), value: cost });
  return [...figures, ...tokenFigures(usage)];
}

/**
 * The card a reply's ⓘ unfolds: two columns, so the values line up beside
 * the longest label.
 */
export function ReplyDetails({ message }: { message: Message }) {
  // Re-renders the labels `replyFigures` builds when the language changes.
  useTranslation();
  const models = useModelsStore((state) => state.models);
  const figures = replyFigures(message, models);
  return (
    <View
      accessible
      accessibilityLabel={figures.map(({ label, value }) => `${label}: ${value}`).join(". ")}
      className="mt-2 flex-row gap-4 rounded-[18px] bg-surface px-3.5 py-[9px]"
      testID="reply-details"
    >
      <View>
        {figures.map(({ label }) => (
          <Text key={label} className="text-[13.5px] leading-[21px] text-text-muted">
            {label}
          </Text>
        ))}
      </View>
      <View className="flex-1">
        {figures.map(({ label, value }) => (
          <Text
            key={label}
            className="text-[13.5px] tabular-nums leading-[21px] text-text"
            numberOfLines={1}
          >
            {value}
          </Text>
        ))}
      </View>
    </View>
  );
}
