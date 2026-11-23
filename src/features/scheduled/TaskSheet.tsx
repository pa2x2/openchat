import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import type { ChatSummary, ScheduledTask } from "@/src/domain";
import { getProvider } from "@/src/lib/providerFactory";
import { useChatsStore } from "@/src/stores/chats";
import { useTasksStore } from "@/src/stores/tasks";
import { showDialog } from "@/src/ui/Dialog";
import { Group, GroupLabel, Row } from "@/src/ui/ListGroup";
import { Sheet } from "@/src/ui/Sheet";
import { Text } from "@/src/ui/Text";
import { describeSchedule, formatWhen } from "./schedule";

export interface TaskSheetProps {
  task: ScheduledTask | null;
  onClose: () => void;
  onOpenChat: (chatId: string) => void;
  onEdit: (task: ScheduledTask) => void;
}

/** The app can only remake a task it can describe in full. */
export function canEdit(task: ScheduledTask): boolean {
  return task.prompt !== null && task.schedule !== null && task.chatId !== undefined;
}

/** A fresh task's runs; null while they load. Read again when the task runs. */
function useRuns(task: ScheduledTask | null) {
  const [loaded, setLoaded] = useState<{
    key: string;
    runs: ChatSummary[] | null;
    failed: boolean;
  } | null>(null);
  const id = task?.earlierRuns === "fresh" ? task.id : null;
  const key = id && task ? `${id}:${task.runCount}` : null;
  useEffect(() => {
    // Read from the store: the task is a new object on every list refresh.
    const fresh = useTasksStore.getState().tasks.find((entry) => entry.id === id);
    if (!fresh || !key) return;
    let current = true;
    void (async () => {
      try {
        const provider = await getProvider();
        const runs = (await provider?.taskRuns?.(fresh)) ?? [];
        if (current) setLoaded({ key, runs, failed: false });
      } catch {
        if (current) setLoaded({ key, runs: null, failed: true });
      }
    })();
    return () => {
      current = false;
    };
  }, [id, key]);
  return loaded?.key === key ? loaded : { runs: null, failed: false };
}

export function TaskSheet({ task, onClose, onOpenChat, onEdit }: TaskSheetProps) {
  const { t } = useTranslation();
  const setPaused = useTasksStore((state) => state.setPaused);
  const remove = useTasksStore((state) => state.remove);
  const chat = useChatsStore((state) =>
    task?.chatId ? state.chats.find((entry) => entry.id === task.chatId) : undefined,
  );
  const { runs, failed } = useRuns(task);
  const [busy, setBusy] = useState(false);
  // Kept while the sheet slides away, so it doesn't go blank on the way down.
  const [shown, setShown] = useState(task);
  if (task && task !== shown) setShown(task);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      showDialog({
        title: t("scheduled.actionFailed"),
        message: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(target: ScheduledTask) {
    showDialog({
      title: t("scheduled.delete.title", { name: target.name }),
      message: t("scheduled.delete.message"),
      actions: [
        { label: t("common.cancel"), style: "cancel" },
        {
          label: t("scheduled.delete.confirm"),
          style: "destructive",
          onPress: () => {
            onClose();
            void run(() => remove(target.id));
          },
        },
      ],
    });
  }

  const lines = shown
    ? [
        [
          describeSchedule(t, shown.schedule),
          shown.nextRunAt !== undefined && shown.status === "active"
            ? t("scheduled.next", { when: formatWhen(t, shown.nextRunAt) })
            : null,
        ],
        [
          shown.runCount > 0 ? t("scheduled.ran", { count: shown.runCount }) : null,
          shown.lastRunAt !== undefined
            ? t("scheduled.lastRun", { when: formatWhen(t, shown.lastRunAt) })
            : null,
          shown.endsAt !== undefined
            ? t("scheduled.ends", { when: formatWhen(t, shown.endsAt) })
            : null,
        ],
      ]
        .map((parts) => parts.filter(Boolean).join(" · "))
        .filter(Boolean)
    : [];

  return (
    <Sheet visible={task !== null} onClose={onClose} title={shown?.name} testID="task-sheet">
      {shown ? (
        <ScrollView className="flex-grow-0" keyboardShouldPersistTaps="handled">
          <View className="-mt-1 mb-3 items-center gap-0.5 px-4">
            {lines.map((line) => (
              <Text key={line} className="text-center text-sm text-text-muted">
                {line}
              </Text>
            ))}
            <Text className="text-center text-sm text-text-muted">
              {t(`scheduled.earlierRuns.${shown.earlierRuns}`)}
              {chat ? ` · ${chat.title}` : ""}
            </Text>
            {shown.problem ? (
              <Text className="mt-1 text-center text-sm text-danger" testID="task-problem">
                {shown.problem}
              </Text>
            ) : null}
          </View>
          <Group>
            {shown.chatId && shown.earlierRuns !== "fresh" ? (
              <Row
                icon="message-text-outline"
                title={t("scheduled.action.openChat")}
                onPress={() => onOpenChat(shown.chatId!)}
                testID="task-open-chat"
              />
            ) : null}
            {shown.status !== "done" ? (
              <Row
                icon={shown.status === "paused" ? "play" : "pause"}
                title={t(
                  shown.status === "paused" ? "scheduled.action.resume" : "scheduled.action.pause",
                )}
                onPress={
                  busy
                    ? undefined
                    : () => void run(() => setPaused(shown.id, shown.status !== "paused"))
                }
                testID="task-pause"
              />
            ) : null}
            {canEdit(shown) ? (
              <Row
                icon="pencil-outline"
                title={t("scheduled.action.edit")}
                onPress={() => onEdit(shown)}
                testID="task-edit"
              />
            ) : null}
            <Row
              icon="trash-can-outline"
              title={t("scheduled.action.delete")}
              destructive
              onPress={() => confirmDelete(shown)}
              testID="task-delete"
            />
          </Group>
          {shown.earlierRuns === "fresh" ? (
            <>
              <GroupLabel>{t("scheduled.runs")}</GroupLabel>
              {failed || (runs && runs.length === 0) ? (
                <Text className="px-3 text-sm text-text-muted">
                  {failed ? t("scheduled.runsFailed") : t("scheduled.noRuns")}
                </Text>
              ) : runs ? (
                <Group testID="task-runs">
                  {runs.map((runChat) => (
                    <Row
                      key={runChat.id}
                      title={formatWhen(t, runChat.updatedAt)}
                      chevron
                      onPress={() => onOpenChat(runChat.id)}
                    />
                  ))}
                </Group>
              ) : null}
            </>
          ) : null}
        </ScrollView>
      ) : null}
    </Sheet>
  );
}
