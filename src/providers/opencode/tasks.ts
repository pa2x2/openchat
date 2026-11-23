/**
 * Scheduled tasks as OpenCode automations.
 *
 * "Earlier runs" rests on two things the bundled server image sets up: the
 * `/scheduled` folder, whose config compacts a chat early, and the
 * `scheduled` agent, which runs a task in a fresh child session. A task's
 * choice is read back from where it runs: a `scheduled` agent target is
 * "fresh", a chat in `/scheduled` "summarized", any other chat "whole-chat".
 *
 * An automation stays tied to the project its chat was in, and `/scheduled`
 * is a project of its own, so moving a chat in or out recreates its tasks.
 */

import {
  isAgentNotFoundError,
  isForbiddenError,
  isLocationNotFoundError,
  isSessionNotFoundError,
  type AutomationInfo,
  type ExperimentalAutomationCreateInput,
  type SessionInfo,
} from "@opencode/client";
import type {
  ChatId,
  ChatSummary,
  EarlierRuns,
  ScheduledTask,
  SchedulingSupport,
  TaskDraft,
  TaskSchedule,
} from "@/src/domain";
import type { OpenCodeClient } from "./client";
import { METADATA_KEY } from "./messages";
import { markRead, RUN_SESSION_PREFIX, toChatSummary } from "./sessions";

const SCHEDULED_DIR = "/scheduled";
const FRESH_AGENT = "scheduled";

/** A server older than automations has no route for them. */
function isMissingRoute(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === "ClientError" &&
    (error as { reason?: string }).reason === "UnexpectedStatus" &&
    (error.cause as { status?: number } | undefined)?.status === 404
  );
}

export async function schedulingSupport(client: OpenCodeClient): Promise<SchedulingSupport | null> {
  try {
    await client.experimental.automation.list();
  } catch (error) {
    // Forbidden: automations are turned off in the server's config.
    if (isForbiddenError(error) || isMissingRoute(error)) return null;
    throw error;
  }
  const [config, summarized, fresh] = await Promise.all([
    client.config.get(),
    hasScheduledFolder(client),
    client.agent.get({ agentID: FRESH_AGENT }).then(
      () => true,
      (error: unknown) => {
        if (isAgentNotFoundError(error)) return false;
        throw error;
      },
    ),
  ]);
  // The last entry wins, as on the server.
  const timeZone = config
    .flatMap((entry) =>
      entry.type === "document" && entry.info.timezone ? [entry.info.timezone] : [],
    )
    .at(-1);
  const earlierRuns: EarlierRuns[] = [
    ...(summarized ? (["summarized"] as const) : []),
    "whole-chat",
    ...(fresh ? (["fresh"] as const) : []),
  ];
  return { ...(timeZone ? { timeZone } : {}), earlierRuns };
}

async function hasScheduledFolder(client: OpenCodeClient): Promise<boolean> {
  try {
    const entries = await client.config.get({ location: { directory: SCHEDULED_DIR } });
    return entries.some((entry) => entry.path === `${SCHEDULED_DIR}/opencode.json`);
  } catch (error) {
    if (isLocationNotFoundError(error)) return false;
    throw error;
  }
}

export async function listTasks(client: OpenCodeClient): Promise<ScheduledTask[]> {
  const infos = await client.experimental.automation.list();
  const adopted = await adoptModelTasks(client, infos);
  return (adopted ? await client.experimental.automation.list() : infos).map(toTask);
}

export async function createTask(client: OpenCodeClient, draft: TaskDraft): Promise<ScheduledTask> {
  if (draft.earlierRuns !== "fresh") await placeChat(client, draft.chatId, draft.earlierRuns);
  const info = await client.experimental.automation.create(toCreateInput(draft));
  // Chats nobody opened since unread marking began never show as unread.
  await markRead(client, draft.chatId);
  return toTask(info);
}

/**
 * Deletes first: creating may move the chat, which would recreate the old
 * task alongside the new one. If creating fails, the old task comes back. A
 * paused task stays paused.
 */
export async function replaceTask(
  client: OpenCodeClient,
  id: string,
  draft: TaskDraft,
): Promise<ScheduledTask> {
  const old = await client.experimental.automation.get({ automationID: id });
  await client.experimental.automation.delete({ automationID: id });
  let task: ScheduledTask;
  try {
    task = await createTask(client, draft);
  } catch (error) {
    await recreate(client, old);
    throw error;
  }
  if (old.status !== "paused") return task;
  await pauseTask(client, task.id);
  return { ...task, status: "paused" };
}

export async function pauseTask(client: OpenCodeClient, id: string): Promise<void> {
  await client.experimental.automation.pause({ automationID: id });
}

export async function resumeTask(client: OpenCodeClient, id: string): Promise<void> {
  await client.experimental.automation.resume({ automationID: id });
}

export async function deleteTask(client: OpenCodeClient, id: string): Promise<void> {
  await client.experimental.automation.delete({ automationID: id });
}

/** The server keeps a chat's tasks when the chat goes, and they fail on every run. */
export async function deleteChatTasks(client: OpenCodeClient, chatId: ChatId): Promise<void> {
  let infos: AutomationInfo[];
  try {
    infos = await client.experimental.automation.list();
  } catch (error) {
    if (isForbiddenError(error) || isMissingRoute(error)) return;
    throw error;
  }
  const owned = infos.filter((info) => info.sessionID === chatId || targetSession(info) === chatId);
  await Promise.all(owned.map((info) => deleteTask(client, info.id)));
}

/** Runs are listed by name, so they outlast a task that was replaced under the same name. */
export async function taskRuns(
  client: OpenCodeClient,
  task: ScheduledTask,
): Promise<ChatSummary[]> {
  if (!task.chatId) return [];
  const sessions: SessionInfo[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.session.list({
      parentID: task.chatId,
      limit: 100,
      order: "desc",
      cursor,
    });
    sessions.push(...page.data);
    cursor = page.data.length > 0 ? (page.cursor.next ?? undefined) : undefined;
  } while (cursor);
  return sessions
    .filter((session) => session.id.startsWith(RUN_SESSION_PREFIX) && session.title === task.name)
    .map(toChatSummary);
}

function targetSession(info: AutomationInfo): string | undefined {
  return info.action.type === "prompt" ? info.action.to.session : undefined;
}

function toTask(info: AutomationInfo): ScheduledTask {
  const prompt = info.action.type === "prompt" ? info.action : undefined;
  const chatId = targetSession(info) ?? info.sessionID;
  const earlierRuns: EarlierRuns =
    prompt?.to.subagent !== undefined
      ? "fresh"
      : info.directory === SCHEDULED_DIR
        ? "summarized"
        : "whole-chat";
  const problem =
    info.lastOutcome === "failed" ||
    info.lastOutcome === "skipped" ||
    info.lastOutcome === "disabled"
      ? info.lastOutput
      : undefined;
  return {
    id: info.id,
    name: info.name,
    ...(chatId ? { chatId } : {}),
    prompt: prompt?.prompt ?? null,
    schedule: toSchedule(info),
    earlierRuns,
    timeZone: info.tz,
    ...(info.expires !== undefined ? { endsAt: info.expires } : {}),
    status: info.status,
    ...(info.nextDueAt !== undefined ? { nextRunAt: info.nextDueAt } : {}),
    runCount: info.runCount,
    ...(info.lastRunAt !== undefined ? { lastRunAt: info.lastRunAt } : {}),
    ...(problem ? { problem } : {}),
  };
}

function toSchedule(info: AutomationInfo): TaskSchedule | null {
  const { trigger } = info;
  switch (trigger.type) {
    case "at":
      // Kept as the model wrote it, maybe as wall-clock time in the task's
      // zone, which the app can't convert; the server worked the instant out.
      return { type: "at", at: info.nextDueAt ?? info.lastRunAt ?? Date.parse(trigger.at) };
    case "every":
      return { type: "every", every: trigger.every };
    case "cron":
      return { type: "cron", cron: trigger.cron };
    default:
      return null;
  }
}

function toCreateInput(draft: TaskDraft): ExperimentalAutomationCreateInput {
  return {
    sessionID: draft.chatId,
    name: draft.name,
    trigger:
      draft.schedule.type === "at"
        ? { type: "at", at: new Date(draft.schedule.at).toISOString() }
        : draft.schedule,
    action: {
      type: "prompt",
      prompt: draft.prompt,
      ...(draft.earlierRuns === "fresh" ? { to: { subagent: FRESH_AGENT } } : {}),
    },
    ...(draft.endsAt !== undefined ? { expires: new Date(draft.endsAt).toISOString() } : {}),
  };
}

/**
 * The same task made anew in its chat's current project, paused if it was.
 * Only prompts on a timer can be: other kinds need a tool call to be made.
 */
async function recreate(client: OpenCodeClient, info: AutomationInfo): Promise<void> {
  if (info.action.type !== "prompt" || info.trigger.type === "event" || info.status === "done") {
    return;
  }
  const { to } = info.action;
  const copy = await client.experimental.automation.create({
    sessionID: info.sessionID,
    name: info.name,
    trigger: info.trigger,
    action: {
      type: "prompt",
      prompt: info.action.prompt,
      // A target that is the chat itself moves with it.
      ...(to.session !== info.sessionID ? { to } : {}),
    },
    ...(info.expires !== undefined ? { expires: new Date(info.expires).toISOString() } : {}),
  });
  if (info.status === "paused") await pauseTask(client, copy.id);
}

/**
 * Puts the chat where `earlierRuns` needs it and recreates the tasks it
 * made. "whole-chat" is remembered on the chat, so `adoptModelTasks` leaves
 * it there.
 */
async function placeChat(
  client: OpenCodeClient,
  chatId: ChatId,
  earlierRuns: "summarized" | "whole-chat",
): Promise<void> {
  const session = await client.session.get({ sessionID: chatId });
  const wholeChat = earlierRuns === "whole-chat";
  if (isWholeChat(session) !== wholeChat) {
    const { [METADATA_KEY]: own, ...others } = session.metadata ?? {};
    await client.session.update({
      sessionID: chatId,
      // The server replaces metadata whole.
      metadata: { ...others, [METADATA_KEY]: { ...asObject(own), wholeChat } },
    });
  }
  const inScheduled = session.location.directory === SCHEDULED_DIR;
  if (wholeChat !== inScheduled) return;
  const directory = wholeChat ? (await client.location.get()).directory : SCHEDULED_DIR;
  const tasks = await client.experimental.automation.list({ sessionID: chatId });
  await client.session.move({ sessionID: chatId, directory });
  for (const info of tasks) {
    await recreate(client, info);
    await deleteTask(client, info.id);
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isWholeChat(session: SessionInfo): boolean {
  return asObject(session.metadata?.[METADATA_KEY]).wholeChat === true;
}

/**
 * The model can't move a chat, so a task it makes to continue the chat
 * starts out sending all of it. The app moves such chats to `/scheduled`,
 * unless the user chose "whole-chat" for them. Only the app's own chats, in
 * the server's default folder, are moved. Says whether it moved any.
 */
async function adoptModelTasks(
  client: OpenCodeClient,
  infos: readonly AutomationInfo[],
): Promise<boolean> {
  const candidates = new Set(
    infos.flatMap((info) =>
      info.sessionID &&
      info.status !== "done" &&
      info.directory !== SCHEDULED_DIR &&
      targetSession(info) === info.sessionID
        ? [info.sessionID]
        : [],
    ),
  );
  if (candidates.size === 0) return false;
  const [home, summarized] = await Promise.all([client.location.get(), hasScheduledFolder(client)]);
  if (!summarized) return false;
  let moved = false;
  for (const chatId of candidates) {
    let session: SessionInfo;
    try {
      session = await client.session.get({ sessionID: chatId });
    } catch (error) {
      if (isSessionNotFoundError(error)) continue;
      throw error;
    }
    if (session.location.directory !== home.directory || isWholeChat(session)) continue;
    await placeChat(client, chatId, "summarized");
    moved = true;
  }
  return moved;
}
