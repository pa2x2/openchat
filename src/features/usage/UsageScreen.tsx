/**
 * Usage screen: what a period used in tokens, cost and model requests, per
 * day and per model. The three totals are also the switch for what the chart
 * and the model list measure.
 *
 * The numbers are the backend's report plus the chats this device deleted
 * (see the usage store), which is what the line at the bottom says.
 */

import { useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { UsageReport } from "@/src/domain";
import { tokenFigures } from "@/src/features/chat/usageFormat";
import { cn } from "@/src/lib/cn";
import { useModelsStore } from "@/src/stores/models";
import { useSettingsStore, type UsageMeasure } from "@/src/stores/settings";
import { useUsageStore } from "@/src/stores/usage";
import { Icon } from "@/src/ui/Icon";
import { Group, GroupLabel, Row } from "@/src/ui/ListGroup";
import { Pressable } from "@/src/ui/Pressable";
import { RefreshControl } from "@/src/ui/RefreshControl";
import { Segmented } from "@/src/ui/Segmented";
import { Skeleton, SkeletonGroup } from "@/src/ui/Skeleton";
import { Text } from "@/src/ui/Text";
import { UsageChart } from "./UsageChart";
import {
  MEASURES,
  PERIODS,
  chartDays,
  formatMeasured,
  modelRows,
  periodQuery,
  summaryLine,
} from "./usageView";

function Totals({
  report,
  measure,
  onChange,
}: {
  report: UsageReport;
  measure: UsageMeasure;
  onChange: (measure: UsageMeasure) => void;
}) {
  return (
    <View accessibilityRole="radiogroup" className="mt-3 flex-row gap-2">
      {MEASURES.map(({ value, label }) => {
        const figure = formatMeasured(report, value);
        if (figure === null) return null;
        const active = value === measure;
        return (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityLabel={`${label}: ${figure}`}
            accessibilityState={{ checked: active }}
            className={cn(
              "flex-1 rounded-2xl px-3 pb-3 pt-2.5",
              active ? "bg-user-bubble" : "bg-surface active:bg-surface-hover",
            )}
            onPress={() => onChange(value)}
            testID={`usage-total-${value}`}
          >
            <Text
              className={cn("text-[13px]", active ? "text-user-bubble-text" : "text-text-muted")}
            >
              {label}
            </Text>
            <Text
              adjustsFontSizeToFit
              className="mt-0.5 text-[22px] font-medium text-text"
              numberOfLines={1}
            >
              {figure}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Report({ report }: { report: UsageReport }) {
  const period = useSettingsStore((state) => state.usagePeriod);
  const chosen = useSettingsStore((state) => state.usageMeasure);
  const setMeasure = useSettingsStore((state) => state.setUsageMeasure);
  const catalog = useModelsStore((state) => state.models);
  // A period with nothing priced has no cost to chart.
  const measure = chosen === "cost" && !report.cost ? "tokens" : chosen;
  const days = chartDays(report, period);
  const models = modelRows(report, catalog, measure);
  const tokens = tokenFigures(report.usage);

  return (
    <>
      <Totals report={report} measure={measure} onChange={setMeasure} />
      <Text className="px-0.5 pt-2.5 text-[13px] text-text-muted" testID="usage-summary">
        {summaryLine(report, period)}
      </Text>
      {days && report.days.length > 0 ? (
        <UsageChart days={days} measure={measure} currency={report.cost?.currency ?? "USD"} />
      ) : null}
      {models.length > 0 ? (
        <>
          <GroupLabel>Models</GroupLabel>
          <Group testID="usage-models">
            {models.map((model) => (
              <Row
                key={model.key}
                title={model.label}
                subtitle={model.provider}
                value={model.value ?? undefined}
              />
            ))}
          </Group>
        </>
      ) : null}
      {tokens.length > 0 ? (
        <>
          <GroupLabel>Tokens</GroupLabel>
          <Group testID="usage-tokens">
            {tokens.map((figure) => (
              <Row key={figure.label} title={figure.label} value={figure.value} />
            ))}
          </Group>
        </>
      ) : null}
      <Text className="px-3 pt-3 text-[12.5px] leading-[17px] text-text-muted">
        Every chat on this server, and chats deleted from this phone.
      </Text>
    </>
  );
}

function LoadingReport() {
  return (
    <SkeletonGroup label="Loading usage" className="mt-3 gap-3" testID="usage-loading">
      <View className="flex-row gap-2">
        <Skeleton className="h-[68px] flex-1 rounded-2xl" />
        <Skeleton className="h-[68px] flex-1 rounded-2xl" />
        <Skeleton className="h-[68px] flex-1 rounded-2xl" />
      </View>
      <Skeleton className="h-[170px] rounded-[20px]" />
      <Skeleton className="h-[150px] rounded-[20px]" />
    </SkeletonGroup>
  );
}

export function UsageScreen() {
  const insets = useSafeAreaInsets();
  const period = useSettingsStore((state) => state.usagePeriod);
  const setPeriod = useSettingsStore((state) => state.setUsagePeriod);
  const report = useUsageStore((state) => state.reports[period]);
  const loading = useUsageStore((state) => state.loading[period] === true);
  const failed = useUsageStore((state) => state.failed[period] === true);
  const load = useUsageStore((state) => state.load);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(() => load(period, periodQuery(period)), [load, period]);
  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleRefresh() {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="px-4 pt-1"
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} />
      }
    >
      <Segmented
        options={PERIODS}
        value={period}
        onChange={setPeriod}
        testIDPrefix="usage-period"
      />
      {failed ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Couldn't load usage. Retry"
          className="mt-3 flex-row items-center gap-2.5 rounded-[14px] bg-danger/10 px-3 py-2.5"
          onPress={() => void reload()}
          testID="usage-error"
        >
          <Icon name="alert-circle-outline" size={18} tone="danger" />
          <Text className="flex-1 text-sm text-danger">Couldn’t load usage</Text>
          <Text className="text-sm font-medium text-primary">Retry</Text>
        </Pressable>
      ) : null}
      {report ? (
        // The last report stays up, dimmed, while the next one loads.
        <View className={cn(loading && "opacity-50")}>
          <Report report={report} />
        </View>
      ) : loading ? (
        <LoadingReport />
      ) : null}
    </ScrollView>
  );
}
