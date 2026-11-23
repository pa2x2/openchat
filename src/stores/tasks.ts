/**
 * Scheduled tasks of the connected server. Not persisted: tasks change on
 * the server while the app is away, so they are read again on each launch.
 */

import type { ChatId, ScheduledTask, SchedulingSupport, TaskDraft } from "@/src/domain";
import { create } from "zustand";
import { getProvider } from "@/src/lib/providerFactory";
import type { ChatProvider } from "@/src/providers/types";
import { t } from "@/src/i18n";

interface TasksStoreState {
  /** Undefined until the first load; null when the server can't run tasks. */
  support: SchedulingSupport | null | undefined;
  tasks: ScheduledTask[];
  loading: boolean;
  /** The last load failed; `tasks` still holds the ones before it. */
  failed: boolean;
  refresh: () => Promise<void>;
  create: (draft: TaskDraft) => Promise<void>;
  replace: (id: string, draft: TaskDraft) => Promise<void>;
  setPaused: (id: string, paused: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clear: () => void;
}

async function scheduling(
  refresh: () => Promise<void>,
  call: (provider: ChatProvider) => Promise<unknown>,
): Promise<void> {
  const provider = await getProvider();
  if (!provider) throw new Error(t("errors.notConnectedShort"));
  try {
    await call(provider);
  } finally {
    await refresh();
  }
}

let running: Promise<void> | null = null;
/** A refresh asked for while one runs; the running one may have read the list before a change. */
let again = false;

export const useTasksStore = create<TasksStoreState>()((set, get) => ({
  support: undefined,
  tasks: [],
  loading: false,
  failed: false,
  refresh: () => {
    if (running) {
      again = true;
      return running;
    }
    const load = async () => {
      set({ loading: true });
      try {
        const provider = await getProvider();
        // Read once per connection: it only changes when the server is set up anew.
        const known = get().support;
        const support =
          known !== undefined ? known : ((await provider?.schedulingSupport?.()) ?? null);
        const tasks = support ? ((await provider?.listTasks?.()) ?? []) : [];
        set({ support, tasks, loading: false, failed: false });
      } catch {
        set({ loading: false, failed: true });
      }
    };
    running = (async () => {
      do {
        again = false;
        await load();
      } while (again);
      running = null;
    })();
    return running;
  },
  create: (draft) => scheduling(get().refresh, async (provider) => provider.createTask?.(draft)),
  replace: (id, draft) =>
    scheduling(get().refresh, async (provider) => provider.replaceTask?.(id, draft)),
  setPaused: (id, paused) =>
    scheduling(get().refresh, async (provider) =>
      paused ? provider.pauseTask?.(id) : provider.resumeTask?.(id),
    ),
  remove: (id) => scheduling(get().refresh, async (provider) => provider.deleteTask?.(id)),
  clear: () => set({ support: undefined, tasks: [], loading: false, failed: false }),
}));

/** The chat's tasks that haven't finished, soonest first. */
export function chatTasks(tasks: readonly ScheduledTask[], chatId: ChatId): ScheduledTask[] {
  return tasks
    .filter((task) => task.chatId === chatId && task.status !== "done")
    .sort((a, b) => (a.nextRunAt ?? Infinity) - (b.nextRunAt ?? Infinity));
}
