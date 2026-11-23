import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ScheduledTask } from "@/src/domain";
import { cn } from "@/src/lib/cn";
import { useChatsStore } from "@/src/stores/chats";
import { useTasksStore } from "@/src/stores/tasks";
import { Icon } from "@/src/ui/Icon";
import { Group, GroupLabel, Row } from "@/src/ui/ListGroup";
import { Pressable } from "@/src/ui/Pressable";
import { RefreshControl } from "@/src/ui/RefreshControl";
import { Skeleton, SkeletonGroup } from "@/src/ui/Skeleton";
import { Text } from "@/src/ui/Text";
import { describeSchedule, formatWhen } from "./schedule";
import { TaskEditor, type EditorTarget } from "./TaskEditor";
import { TaskSheet } from "./TaskSheet";

const SECTIONS = ["active", "paused", "done"] as const;

function Chip({ label, tone }: { label: string; tone: "danger" | "muted" }) {
  return (
    <View
      className={cn(
        "flex-row items-center gap-1 rounded-full px-2 py-0.5",
        tone === "danger" ? "bg-danger/10" : "bg-raised",
      )}
    >
      {tone === "danger" ? <Icon name="alert-circle-outline" size={13} tone="danger" /> : null}
      <Text className={cn("text-[12.5px]", tone === "danger" ? "text-danger" : "text-text-muted")}>
        {label}
      </Text>
    </View>
  );
}

export function ScheduledScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const support = useTasksStore((state) => state.support);
  const tasks = useTasksStore((state) => state.tasks);
  const loading = useTasksStore((state) => state.loading);
  const failed = useTasksStore((state) => state.failed);
  const refresh = useTasksStore((state) => state.refresh);
  const chats = useChatsStore((state) => state.chats);
  const [refreshing, setRefreshing] = useState(false);
  const [opened, setOpened] = useState<ScheduledTask | null>(null);
  const [editing, setEditing] = useState<EditorTarget | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The sheet follows the list, so it shows a pause or a failure as it lands.
  const openedTask = opened ? (tasks.find((task) => task.id === opened.id) ?? null) : null;

  async function handleRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  function openChat(chatId: string) {
    setOpened(null);
    router.dismissTo({ pathname: "/chat/[id]", params: { id: chatId } });
  }

  function chatTitle(task: ScheduledTask): string | null {
    if (task.earlierRuns === "fresh") return t("scheduled.earlierRuns.fresh");
    return chats.find((chat) => chat.id === task.chatId)?.title ?? null;
  }

  function trailing(task: ScheduledTask) {
    if (task.problem) return <Chip label={t("scheduled.failed")} tone="danger" />;
    if (task.status === "paused") return <Chip label={t("scheduled.paused")} tone="muted" />;
    if (task.status === "active" && task.nextRunAt !== undefined) {
      return <Text className="text-[14px] text-text-muted">{formatWhen(t, task.nextRunAt)}</Text>;
    }
    return undefined;
  }

  const empty = support !== undefined && tasks.length === 0;

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pt-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} />
        }
      >
        {failed ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t("scheduled.loadFailed")}. ${t("common.retry")}`}
            className="mt-3 flex-row items-center gap-2.5 rounded-[14px] bg-danger/10 px-3 py-2.5"
            onPress={() => void refresh()}
            testID="scheduled-error"
          >
            <Icon name="alert-circle-outline" size={18} tone="danger" />
            <Text className="flex-1 text-sm text-danger">{t("scheduled.loadFailed")}</Text>
            <Text className="text-sm font-medium text-primary">{t("common.retry")}</Text>
          </Pressable>
        ) : null}
        {support === undefined && loading ? (
          <SkeletonGroup label={t("scheduled.loading")} className="mt-4 gap-3">
            <Skeleton className="h-[150px] rounded-[20px]" />
          </SkeletonGroup>
        ) : null}
        {support === null ? (
          <Text className="px-3 pt-6 text-center text-[15px] text-text-muted">
            {t("scheduled.unsupported")}
          </Text>
        ) : empty ? (
          <View className="items-center gap-2 px-6 pt-16" testID="scheduled-empty">
            <Icon name="calendar-clock" size={36} tone="textMuted" />
            <Text className="text-center text-[17px] font-medium text-text">
              {t("scheduled.empty")}
            </Text>
            <Text className="text-center text-sm text-text-muted">{t("scheduled.emptyHint")}</Text>
          </View>
        ) : (
          SECTIONS.map((status) => {
            const section = tasks.filter((task) => task.status === status);
            if (section.length === 0) return null;
            return (
              <View key={status}>
                <GroupLabel>{t(`scheduled.section.${status}`)}</GroupLabel>
                <Group testID={`scheduled-${status}`}>
                  {section.map((task) => (
                    <Row
                      key={task.id}
                      icon="calendar-clock"
                      title={task.name}
                      subtitle={[describeSchedule(t, task.schedule), chatTitle(task)]
                        .filter(Boolean)
                        .join(" · ")}
                      trailing={trailing(task)}
                      onPress={() => setOpened(task)}
                      testID={`task-${task.id}`}
                    />
                  ))}
                </Group>
              </View>
            );
          })
        )}
      </ScrollView>
      {support ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("scheduled.newTask")}
          className="absolute right-4 flex-row items-center gap-2 rounded-full bg-primary px-5 py-3.5 active:bg-primary/80"
          style={{ bottom: insets.bottom + 16 }}
          onPress={() => setEditing({})}
          testID="scheduled-new"
        >
          <Icon name="plus" size={20} tone="primaryForeground" />
          <Text className="text-base font-medium text-primary-foreground">
            {t("scheduled.newTask")}
          </Text>
        </Pressable>
      ) : null}
      <TaskSheet
        task={openedTask}
        onClose={() => setOpened(null)}
        onOpenChat={openChat}
        onEdit={(task) => {
          setOpened(null);
          setEditing({ task });
        }}
      />
      <TaskEditor target={editing} onClose={() => setEditing(null)} />
    </View>
  );
}
