import type {
  AutomationInfo,
  ExperimentalAutomationCreateInput,
  SessionInfo,
} from "@opencode/client";
import type { OpenCodeClient } from "../client";
import { replaceTask } from "../tasks";

/**
 * Keeps the server's rules that matter here: a task belongs to the project
 * its chat was in when the task was made, and a task made without a target
 * continues its own chat.
 */
function fakeServer(chatId: string, directory: string) {
  const tasks = new Map<string, AutomationInfo>();
  let created = 0;
  const chat = { directory };

  function found(id: string): AutomationInfo {
    const info = tasks.get(id);
    if (!info) throw new Error(`no automation ${id}`);
    return info;
  }

  const client = {
    location: { get: async () => ({ directory }) },
    session: {
      get: async () =>
        ({ id: chatId, location: { directory: chat.directory }, time: { idle: 1 } }) as SessionInfo,
      update: async () => undefined,
      view: async () => undefined,
      move: async (input: { directory: string }) => {
        chat.directory = input.directory;
      },
    },
    experimental: {
      automation: {
        list: async (input?: { sessionID?: string }) =>
          [...tasks.values()].filter(
            (info) => input?.sessionID === undefined || info.sessionID === input.sessionID,
          ),
        get: async (input: { automationID: string }) => found(input.automationID),
        create: async (input: ExperimentalAutomationCreateInput) => {
          created += 1;
          const info = {
            id: `aut_${created}`,
            name: input.name,
            projectID: chat.directory,
            sessionID: input.sessionID,
            directory: chat.directory,
            trigger: input.trigger,
            tz: "UTC",
            action:
              input.action.type === "prompt"
                ? { ...input.action, to: input.action.to ?? { session: input.sessionID } }
                : input.action,
            status: "active",
            runCount: 0,
            time: { created: 0, updated: 0 },
          } as AutomationInfo;
          tasks.set(info.id, info);
          return info;
        },
        delete: async (input: { automationID: string }) => {
          found(input.automationID);
          tasks.delete(input.automationID);
        },
        pause: async (input: { automationID: string }) => {
          tasks.set(input.automationID, { ...found(input.automationID), status: "paused" });
        },
      },
    },
  } as unknown as OpenCodeClient;

  return { client, chat, tasks };
}

it("moving a chat while replacing its task keeps every task once, in the new project, paused", async () => {
  const server = fakeServer("ses_chat", "/conversations");
  const { automation } = server.client.experimental;
  for (const name of ["Digest", "Standup"]) {
    const info = await automation.create({
      sessionID: "ses_chat",
      name,
      trigger: { type: "cron", cron: "0 9 * * 1-5" },
      action: { type: "prompt", prompt: `old ${name}` },
    });
    await automation.pause({ automationID: info.id });
  }
  const standup = [...server.tasks.values()].find((info) => info.name === "Standup")!;

  const replaced = await replaceTask(server.client, standup.id, {
    name: "Standup",
    chatId: "ses_chat",
    prompt: "new Standup",
    schedule: { type: "cron", cron: "0 8 * * *" },
    earlierRuns: "summarized",
  });

  expect(server.chat.directory).toBe("/scheduled");
  expect(replaced.status).toBe("paused");
  const left = [...server.tasks.values()]
    .map((info) => ({
      name: info.name,
      directory: info.directory,
      status: info.status,
      prompt: info.action.type === "prompt" ? info.action.prompt : null,
      target: info.action.type === "prompt" ? info.action.to.session : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  expect(left).toEqual([
    {
      name: "Digest",
      directory: "/scheduled",
      status: "paused",
      prompt: "old Digest",
      target: "ses_chat",
    },
    {
      name: "Standup",
      directory: "/scheduled",
      status: "paused",
      prompt: "new Standup",
      target: "ses_chat",
    },
  ]);
});
