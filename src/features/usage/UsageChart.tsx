/**
 * A bar per day of the period. One series, so no legend: the selected total
 * above it names what the bars measure. Drawn from views, as the app has no
 * SVG renderer.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { cn } from "@/src/lib/cn";
import type { UsageMeasure } from "@/src/stores/settings";
import { Pressable } from "@/src/ui/Pressable";
import { Text } from "@/src/ui/Text";
import { chartTop, dayReadout, formatTick, measured, type ChartDay } from "./usageView";

const PLOT_HEIGHT = 128;
/** Left clear above the top gridline, so its label is not cut off. */
const HEADROOM = 8;
const TICK_LINE_HEIGHT = 14;
/** Past this many days a label under every bar no longer fits. */
const MAX_LABELLED_DAYS = 7;

export interface UsageChartProps {
  days: ChartDay[];
  measure: UsageMeasure;
  currency: string;
}

export function UsageChart({ days, measure, currency }: UsageChartProps) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<string | null>(null);
  const values = days.map((day) => (day.totals ? measured(day.totals, measure) : 0));
  const top = chartTop(Math.max(...values));
  const height = (value: number) => (value / top) * (PLOT_HEIGHT - HEADROOM);

  // Until a day is tapped, and once the period moves on past it, the latest day with use.
  const shown =
    days.find((day) => day.date === picked) ?? days.findLast((day) => day.totals) ?? days.at(-1);
  if (!shown) return null;
  const readout = dayReadout(t, shown, measure);
  const ticks = [top, top / 2, 0].map((tick) => ({
    tick,
    label: formatTick(t, tick, measure, currency),
  }));
  const everyDayLabelled = days.length <= MAX_LABELLED_DAYS;
  const middle = days[Math.floor((days.length - 1) / 2)];

  return (
    <View className="mt-5" testID="usage-chart">
      <View accessible accessibilityLiveRegion="polite" className="h-10">
        <Text className="text-[15px] font-medium text-text">{readout.lead}</Text>
        <Text className="text-[13px] text-text-muted" numberOfLines={1}>
          {readout.rest}
        </Text>
      </View>

      <View className="mt-2 flex-row">
        <View className="pr-1.5">
          {/* Hidden copies size the column to the widest label, so none wraps. */}
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {ticks.map(({ tick, label }) => (
              <Text
                key={tick}
                className="text-[11px] opacity-0"
                numberOfLines={1}
                style={{ lineHeight: TICK_LINE_HEIGHT }}
              >
                {label}
              </Text>
            ))}
          </View>
          {ticks.map(({ tick, label }) => (
            <Text
              key={tick}
              className="absolute right-1.5 text-[11px] text-text-faint"
              numberOfLines={1}
              style={{
                top: PLOT_HEIGHT - height(tick) - TICK_LINE_HEIGHT / 2,
                lineHeight: TICK_LINE_HEIGHT,
              }}
            >
              {label}
            </Text>
          ))}
        </View>
        <View className="flex-1">
          <View className="border-b border-border" style={{ height: PLOT_HEIGHT }}>
            {[top, top / 2].map((tick) => (
              <View
                key={tick}
                className="absolute left-0 right-0 h-px bg-surface-hover"
                style={{ bottom: height(tick) }}
              />
            ))}
            <View className="absolute inset-0 flex-row">
              {days.map((day, index) => {
                const selected = day.date === shown.date;
                // No minimum height: a stub for a day far below the top one reads
                // as real spend. Its figures are still a tap away.
                const bar = height(values[index]);
                return (
                  <Pressable
                    key={day.date}
                    accessibilityRole="button"
                    accessibilityLabel={`${day.label}: ${dayReadout(t, day, measure).lead}`}
                    accessibilityState={{ selected }}
                    className={cn(
                      "flex-1 items-center justify-end rounded-t-[4px]",
                      selected && "bg-surface-hover",
                    )}
                    onPress={() => setPicked(day.date)}
                    testID={`usage-day-${day.date}`}
                  >
                    {bar >= 1 ? (
                      <View
                        className="rounded-t-[3px] bg-primary"
                        style={{ width: everyDayLabelled ? 20 : 7, height: bar }}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View className={cn("mt-1 flex-row", !everyDayLabelled && "justify-between")}>
            {(everyDayLabelled ? days : [days[0], middle, days[days.length - 1]]).map((day) => (
              <Text
                key={day.date}
                className={cn(
                  "text-[11px] text-text-faint",
                  everyDayLabelled && "flex-1 text-center",
                )}
              >
                {everyDayLabelled ? day.weekday : day.monthDay}
              </Text>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}
