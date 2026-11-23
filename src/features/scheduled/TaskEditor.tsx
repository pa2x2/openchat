import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import type { ChatId, EarlierRuns, ScheduledTask } from "@/src/domain";
import { cn } from "@/src/lib/cn";
import { getProvider } from "@/src/lib/providerFactory";
import { formatMonthDay } from "@/src/lib/time";
import { listedChats, useChatsStore } from "@/src/stores/chats";
import { useSettingsStore } from "@/src/stores/settings";
import { chatTasks, useTasksStore } from "@/src/stores/tasks";
import { Button } from "@/src/ui/Button";
import { Icon } from "@/src/ui/Icon";
import { Input } from "@/src/ui/Input";
import { Group, GroupLabel, Row } from "@/src/ui/ListGroup";
import { Pressable } from "@/src/ui/Pressable";
import { Segmented } from "@/src/ui/Segmented";
import { Sheet } from "@/src/ui/Sheet";
import { Text } from "@/src/ui/Text";
import {
  formatClock,
  formatWhen,
  scheduleForm,
  scheduleProblem,
  toSchedule,
  type EveryUnit,
  type ScheduleForm,
  type ScheduleKind,
} from "./schedule";

/**
 * What the editor opens on: a task to replace, or a new one, maybe for a
 * given chat. A new task without a chat goes to a new chat named after it.
 */
export type EditorTarget = { task: ScheduledTask } | { chatId?: ChatId };

const KINDS: readonly ScheduleKind[] = ["days", "at", "every", "cron"];
const UNITS: readonly EveryUnit[] = ["minutes", "hours", "days"];
/** Monday first, as people list a week; 0 is Sunday, as in cron. */
const WEEK = [1, 2, 3, 4, 5, 6, 0];

function pickDate(value: number, mode: "date" | "time", onPick: (picked: Date) => void) {
  DateTimePickerAndroid.open({
    value: new Date(value),
    mode,
    is24Hour: true,
    onChange: (event, picked) => {
      if (event.type === "set" && picked) onPick(picked);
    },
  });
}

function withDate(epochMs: number, picked: Date): number {
  const next = new Date(epochMs);
  next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  return next.getTime();
}

function withTime(epochMs: number, picked: Date): number {
  const next = new Date(epochMs);
  next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  return next.getTime();
}

function ChatPicker({
  visible,
  selected,
  onPick,
  onClose,
}: {
  visible: boolean;
  selected: ChatId | undefined;
  onPick: (chatId: ChatId | undefined) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const chats = useChatsStore((state) => state.chats);
  const temporary = useChatsStore((state) => state.temporary);
  return (
    <Sheet visible={visible} onClose={onClose} title={t("scheduled.pickChat")} height="70%">
      <ScrollView className="flex-1">
        <Group>
          <Row
            icon="plus"
            title={t("scheduled.field.newChat")}
            selected={selected === undefined}
            trailing={selected === undefined ? <Icon name="check" size={20} /> : undefined}
            onPress={() => onPick(undefined)}
          />
          {listedChats(chats, temporary).map((chat) => (
            <Row
              key={chat.id}
              title={chat.title}
              selected={chat.id === selected}
              trailing={chat.id === selected ? <Icon name="check" size={20} /> : undefined}
              onPress={() => onPick(chat.id)}
            />
          ))}
        </Group>
      </ScrollView>
    </Sheet>
  );
}

interface Fields {
  name: string;
  prompt: string;
  schedule: ScheduleForm;
  endsAt: number | undefined;
  chatId: ChatId | undefined;
  earlierRuns: EarlierRuns;
}

function initialFields(target: EditorTarget, choices: readonly EarlierRuns[]): Fields {
  if ("task" in target) {
    const { task } = target;
    return {
      name: task.name,
      prompt: task.prompt ?? "",
      schedule: scheduleForm(task.schedule),
      endsAt: task.endsAt,
      chatId: task.chatId,
      earlierRuns: choices.includes(task.earlierRuns) ? task.earlierRuns : choices[0],
    };
  }
  return {
    name: "",
    prompt: "",
    schedule: scheduleForm(null),
    endsAt: undefined,
    chatId: target.chatId,
    earlierRuns: choices[0],
  };
}

function Editor({ target, onDone }: { target: EditorTarget; onDone: () => void }) {
  const { t } = useTranslation();
  const support = useTasksStore((state) => state.support);
  const tasks = useTasksStore((state) => state.tasks);
  const createTask = useTasksStore((state) => state.create);
  const replaceTask = useTasksStore((state) => state.replace);
  const chats = useChatsStore((state) => state.chats);
  const choices = support?.earlierRuns ?? ["whole-chat"];
  const [fields, setFields] = useState(() => initialFields(target, choices));
  const [pickingChat, setPickingChat] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = "task" in target ? target.task : null;
  const { schedule } = fields;

  const update = (patch: Partial<Fields>) => setFields((current) => ({ ...current, ...patch }));
  const updateSchedule = (patch: Partial<ScheduleForm>) =>
    setFields((current) => ({ ...current, schedule: { ...current.schedule, ...patch } }));

  const chatTitle =
    fields.chatId === undefined
      ? t("scheduled.field.newChat")
      : (chats.find((chat) => chat.id === fields.chatId)?.title ?? t("scheduled.field.newChat"));
  // The choice is the chat's: its other tasks that continue it change with it.
  const others = fields.chatId
    ? chatTasks(tasks, fields.chatId).filter(
        (task) => task.id !== editing?.id && task.earlierRuns !== "fresh",
      )
    : [];
  const changesOthers =
    fields.earlierRuns !== "fresh" &&
    others.some((task) => task.earlierRuns !== fields.earlierRuns);
  const problem = scheduleProblem(t, schedule);
  const ready = fields.name.trim() !== "" && fields.prompt.trim() !== "" && problem === null;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      let chatId = fields.chatId;
      if (chatId === undefined) {
        const provider = await getProvider();
        if (!provider) throw new Error(t("errors.notConnectedShort"));
        const providerId = provider.id;
        const model = useSettingsStore.getState().lastModels[providerId];
        const created = await provider.createChat({
          title: fields.name.trim(),
          ...(model ? { model } : {}),
        });
        useChatsStore.getState().upsert(created);
        chatId = created.id;
      }
      const draft = {
        name: fields.name.trim(),
        prompt: fields.prompt.trim(),
        chatId,
        schedule: toSchedule(schedule),
        earlierRuns: fields.earlierRuns,
        ...(fields.endsAt !== undefined ? { endsAt: fields.endsAt } : {}),
      };
      if (editing) await replaceTask(editing.id, draft);
      else await createTask(draft);
      onDone();
    } catch (failure) {
      setError(
        failure instanceof Error && failure.message ? failure.message : t("errors.unexpected"),
      );
    } finally {
      setSaving(false);
    }
  }

  const zone = support?.timeZone;
  const wallClockKind = schedule.kind === "days" || schedule.kind === "cron";

  return (
    <>
      <ScrollView className="flex-grow-0" keyboardShouldPersistTaps="handled">
        <View className="gap-3">
          <Input
            label={t("scheduled.field.name")}
            value={fields.name}
            onChangeText={(name) => update({ name })}
            autoCapitalize="sentences"
            testID="task-name"
          />
          <Input
            label={t("scheduled.field.prompt")}
            value={fields.prompt}
            onChangeText={(prompt) => update({ prompt })}
            multiline
            autoCapitalize="sentences"
            testID="task-prompt"
          />
          <Text className="-mt-1.5 px-1 text-[12.5px] text-text-muted">
            {t("scheduled.field.promptHint")}
          </Text>
        </View>

        <GroupLabel>{t("scheduled.field.runs")}</GroupLabel>
        <Segmented
          options={KINDS.map((kind) => ({ value: kind, label: t(`scheduled.kind.${kind}`) }))}
          value={schedule.kind}
          onChange={(kind) => updateSchedule({ kind })}
          testIDPrefix="task-kind"
        />
        <View className="mt-2 gap-2">
          {schedule.kind === "days" ? (
            <View className="flex-row justify-between px-1" accessibilityRole="none">
              {WEEK.map((day) => {
                const on = schedule.days.includes(day);
                const label = t("time.weekdaysShort", { returnObjects: true })[day];
                return (
                  <Pressable
                    key={day}
                    accessibilityRole="checkbox"
                    accessibilityLabel={label}
                    accessibilityState={{ checked: on }}
                    className={cn(
                      "h-10 w-10 items-center justify-center rounded-full",
                      on ? "bg-primary" : "bg-surface active:bg-surface-hover",
                    )}
                    onPress={() =>
                      updateSchedule({
                        days: on
                          ? schedule.days.filter((other) => other !== day)
                          : [...schedule.days, day],
                      })
                    }
                    testID={`task-day-${day}`}
                  >
                    <Text
                      className={cn(
                        "text-[13px] font-medium",
                        on ? "text-primary-foreground" : "text-text",
                      )}
                    >
                      {label.slice(0, 2)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          {schedule.kind === "at" || schedule.kind === "days" ? (
            <Group>
              {schedule.kind === "at" ? (
                <Row
                  icon="calendar-outline"
                  title={t("scheduled.field.date")}
                  value={formatMonthDay(t, new Date(schedule.at))}
                  onPress={() =>
                    pickDate(schedule.at, "date", (picked) =>
                      updateSchedule({ at: withDate(schedule.at, picked) }),
                    )
                  }
                  testID="task-date"
                />
              ) : null}
              <Row
                icon="clock-outline"
                title={t("scheduled.field.time")}
                value={
                  schedule.kind === "at"
                    ? formatClock(
                        new Date(schedule.at).getHours() * 60 + new Date(schedule.at).getMinutes(),
                      )
                    : formatClock(schedule.time)
                }
                onPress={() => {
                  if (schedule.kind === "at") {
                    pickDate(schedule.at, "time", (picked) =>
                      updateSchedule({ at: withTime(schedule.at, picked) }),
                    );
                    return;
                  }
                  const base = new Date();
                  base.setHours(Math.floor(schedule.time / 60), schedule.time % 60, 0, 0);
                  pickDate(base.getTime(), "time", (picked) =>
                    updateSchedule({ time: picked.getHours() * 60 + picked.getMinutes() }),
                  );
                }}
                testID="task-time"
              />
            </Group>
          ) : null}
          {schedule.kind === "every" ? (
            <View className="gap-2">
              <Input
                label={t("scheduled.field.every")}
                value={schedule.every.count > 0 ? String(schedule.every.count) : ""}
                onChangeText={(text) =>
                  updateSchedule({
                    every: { ...schedule.every, count: Number(text.replace(/\D/g, "")) || 0 },
                  })
                }
                keyboardType="numeric"
                testID="task-every"
              />
              <Segmented
                options={UNITS.map((unit) => ({ value: unit, label: t(`scheduled.unit.${unit}`) }))}
                value={schedule.every.unit}
                onChange={(unit) => updateSchedule({ every: { ...schedule.every, unit } })}
                testIDPrefix="task-unit"
              />
            </View>
          ) : null}
          {schedule.kind === "cron" ? (
            <Input
              label={t("scheduled.field.cron")}
              value={schedule.cron}
              onChangeText={(cron) => updateSchedule({ cron })}
              placeholder="0 8 * * 1-5"
              autoCapitalize="none"
              autoCorrect={false}
              testID="task-cron"
            />
          ) : null}
          {schedule.kind === "cron" ? (
            <Text className="px-1 text-[12.5px] text-text-muted">
              {t("scheduled.field.cronHint")}
            </Text>
          ) : null}
          {problem ? <Text className="px-1 text-[12.5px] text-danger">{problem}</Text> : null}
          {wallClockKind && zone ? (
            <Text className="px-1 text-[12.5px] text-text-muted">
              {t("scheduled.zone", { zone })}
            </Text>
          ) : null}
        </View>

        <View className="h-3" />
        <Group>
          {schedule.kind !== "at" ? (
            <Row
              icon="calendar-end"
              title={t("scheduled.field.ends")}
              value={
                fields.endsAt === undefined
                  ? t("scheduled.field.never")
                  : formatWhen(t, fields.endsAt)
              }
              trailing={
                fields.endsAt !== undefined ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("scheduled.field.clearEnd")}
                    hitSlop={10}
                    onPress={() => update({ endsAt: undefined })}
                  >
                    <Icon name="close" size={18} tone="textMuted" />
                  </Pressable>
                ) : undefined
              }
              onPress={() => {
                const start = fields.endsAt ?? Date.now() + 7 * 86_400_000;
                pickDate(start, "date", (picked) => {
                  const end = new Date(picked);
                  end.setHours(23, 59, 0, 0);
                  update({ endsAt: end.getTime() });
                });
              }}
              testID="task-ends"
            />
          ) : null}
          <Row
            icon="message-text-outline"
            title={t("scheduled.field.chat")}
            value={chatTitle}
            chevron
            onPress={() => setPickingChat(true)}
            testID="task-chat"
          />
        </Group>

        <GroupLabel>{t("scheduled.field.earlierRuns")}</GroupLabel>
        {choices.length > 1 ? (
          <Segmented
            options={choices.map((choice) => ({
              value: choice,
              label: t(`scheduled.earlierRuns.${choice}`),
            }))}
            value={fields.earlierRuns}
            onChange={(earlierRuns) => update({ earlierRuns })}
            testIDPrefix="task-earlier"
          />
        ) : null}
        <Text className="px-1 pt-2 text-[12.5px] leading-[17px] text-text-muted">
          {choices.length > 1
            ? t(`scheduled.earlierRuns.hint.${fields.earlierRuns}`)
            : t("scheduled.earlierRuns.locked")}
          {changesOthers ? ` ${t("scheduled.earlierRuns.changesOthers")}` : ""}
        </Text>
        {error ? (
          <Text className="px-1 pt-3 text-sm text-danger" testID="task-error">
            {error}
          </Text>
        ) : null}
      </ScrollView>
      <Button
        label={t(editing ? "scheduled.save" : "scheduled.create")}
        onPress={() => void save()}
        disabled={!ready}
        loading={saving}
        className="mt-4"
        testID="task-save"
      />
      <ChatPicker
        visible={pickingChat}
        selected={fields.chatId}
        onPick={(chatId) => {
          update({ chatId });
          setPickingChat(false);
        }}
        onClose={() => setPickingChat(false)}
      />
    </>
  );
}

export function TaskEditor({
  target,
  onClose,
}: {
  /** Null while closed. */
  target: EditorTarget | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  // Kept while the sheet slides away; a new target starts a fresh form.
  const [shown, setShown] = useState(target);
  const [opened, setOpened] = useState(0);
  if (target && target !== shown) {
    setShown(target);
    setOpened(opened + 1);
  }
  return (
    <Sheet
      visible={target !== null}
      onClose={onClose}
      title={t(shown && "task" in shown ? "scheduled.editTask" : "scheduled.newTask")}
      height="85%"
      testID="task-editor"
    >
      {shown ? <Editor key={opened} target={shown} onDone={onClose} /> : null}
    </Sheet>
  );
}
