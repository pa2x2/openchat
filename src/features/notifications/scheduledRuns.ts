/**
 * Tells the user about replies that scheduled tasks write, which no screen of
 * this app is waiting on.
 *
 * While the app runs, `followScheduledRuns` hears each run end on the
 * backend's event stream: in front, the chat list is re-read so the chat
 * shows as unread; behind, a notification is posted. While the app isn't
 * running, a background task looks for runs that ended since the last look,
 * as often as Android allows (about every 15 minutes). Both post through the
 * turn notifier, one notification per chat, so a run both see shows once.
 */

import { AppState } from "react-native";
import * as BackgroundTask from "expo-background-task";
import * as Linking from "expo-linking";
import * as TaskManager from "expo-task-manager";
import type { ChatId, ScheduledTask } from "@/src/domain";
import { t } from "@/src/i18n";
import { getProvider } from "@/src/lib/providerFactory";
import type { ChatProvider } from "@/src/providers/types";
import { useChatsStore } from "@/src/stores/chats";
import { useMessagesStore } from "@/src/stores/messages";
import { mmkvStorage } from "@/src/stores/storage";
import { useTasksStore } from "@/src/stores/tasks";
import { TurnNotifier } from "@/modules/turn-notifier";
import { snippet } from "./turnNotifications";

const CHECK_TASK = "OpenChatScheduledRuns";
/** Epoch ms up to which runs have been told about. */
const CHECKED_KEY = "scheduledRunsCheckedAt";
const CHECK_INTERVAL_MINUTES = 15;
const SNIPPET_LENGTH = 300;
const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;

TaskManager.defineTask(CHECK_TASK, async () => {
  try {
    await checkRuns();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerRunChecks(): Promise<void> {
  await BackgroundTask.registerTaskAsync(CHECK_TASK, {
    minimumInterval: CHECK_INTERVAL_MINUTES,
  }).catch(() => undefined);
}

export async function unregisterRunChecks(): Promise<void> {
  if (!(await TaskManager.isTaskRegisteredAsync(CHECK_TASK).catch(() => false))) return;
  await BackgroundTask.unregisterTaskAsync(CHECK_TASK).catch(() => undefined);
}

function checkedAt(): number | null {
  const raw = mmkvStorage.getItem(CHECKED_KEY);
  return typeof raw === "string" ? Number(raw) : null;
}

function markChecked(at: number): void {
  void mmkvStorage.setItem(CHECKED_KEY, String(at));
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** A fresh run is a chat of its own, found among the runs of a task that just ran. */
const FRESH_RUN_WINDOW_MS = 60 * 60_000;

/** The task whose run `chatId` is: its own chat, or one of its fresh runs. */
async function runTask(
  provider: ChatProvider,
  tasks: readonly ScheduledTask[],
  chatId: ChatId,
): Promise<ScheduledTask | undefined> {
  const own = tasks.find((task) => task.chatId === chatId && task.earlierRuns !== "fresh");
  if (own) return own;
  const recent = tasks.filter(
    (task) =>
      task.earlierRuns === "fresh" &&
      task.lastRunAt !== undefined &&
      Date.now() - task.lastRunAt < FRESH_RUN_WINDOW_MS,
  );
  for (const task of recent) {
    const runs = (await provider.taskRuns?.(task)) ?? [];
    if (runs.some((run) => run.id === chatId)) return task;
  }
  return undefined;
}

async function notifyRun(provider: ChatProvider, chatId: ChatId, title: string): Promise<void> {
  if (!TurnNotifier) return;
  const reply = (await provider.fetchMessages(chatId)).findLast(
    (message) => message.role === "assistant",
  );
  const body =
    reply?.status === "error"
      ? t("errors.replyFailed")
      : snippet(reply?.text ?? "", SNIPPET_LENGTH) || t("notifications.replyReady");
  TurnNotifier.notify(chatId, title, body, Linking.createURL(`chat/${chatId}`));
}

export async function followScheduledRuns(signal: AbortSignal): Promise<void> {
  let backoffMs = INITIAL_BACKOFF_MS;
  while (!signal.aborted) {
    const provider = await getProvider();
    if (!provider?.runsEnded) return;
    for await (const chatId of provider.runsEnded(signal)) {
      backoffMs = INITIAL_BACKOFF_MS;
      const messages = useMessagesStore.getState();
      // A turn this app follows is told about by the turn notifier.
      if (messages.activeTurns[chatId]) continue;
      // A chat on screen, or opened before, shows the run without a reopen.
      if (messages.byChat[chatId]) void messages.fetchMessages(chatId).catch(() => undefined);
      void onRunEnded(provider, chatId).catch(() => undefined);
    }
    await sleep(backoffMs, signal);
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
  }
}

async function onRunEnded(provider: ChatProvider, chatId: ChatId): Promise<void> {
  await useTasksStore.getState().refresh();
  const task = await runTask(provider, useTasksStore.getState().tasks, chatId);
  if (!task) return;
  void useChatsStore.getState().refresh();
  if (AppState.currentState === "active") return;
  const chat = useChatsStore.getState().chats.find((entry) => entry.id === chatId);
  await notifyRun(provider, chatId, chat?.title ?? task.name);
  markChecked(Date.now());
}

/**
 * Tells about every run that ended since the last check. A run still going
 * is left for the next check, which starts from it.
 */
async function checkRuns(): Promise<void> {
  const provider = await getProvider();
  if (!provider?.listTasks || !(await provider.schedulingSupport?.())) return;
  const now = Date.now();
  const since = checkedAt();
  // The first check only sets where the next one starts.
  if (since === null) {
    markChecked(now);
    return;
  }
  const tasks = await provider.listTasks();
  let next = now;
  for (const task of tasks) {
    if (task.lastRunAt === undefined || task.lastRunAt <= since) continue;
    const chatId =
      task.earlierRuns === "fresh" ? (await provider.taskRuns?.(task))?.[0]?.id : task.chatId;
    if (!chatId) continue;
    if (await provider.isRunning?.(chatId)) {
      next = Math.min(next, task.lastRunAt - 1);
      continue;
    }
    const chats = useChatsStore.getState().chats;
    const title = chats.find((chat) => chat.id === chatId)?.title ?? task.name;
    await notifyRun(provider, chatId, title);
  }
  markChecked(next);
}
