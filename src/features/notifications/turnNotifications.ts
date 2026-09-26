/**
 * Lets replies finish while the app is in the background and tells the user
 * when they have.
 *
 * While any turn is live, the TurnNotifier service keeps the process and its
 * JS timers running (see TurnNotifierModule.kt), so the stream machine goes on
 * exactly as in the foreground. This module only watches the messages store:
 * the set of live chats drives the service, and a turn that ends or a form
 * that arrives while the app is not in front posts a notification that opens
 * its chat. One notification per chat; a newer one replaces it.
 *
 * The service also stays up while a notification is being prepared: its title
 * may need a few timed retries, and backgrounded timers only run while it does.
 */

import { AppRegistry, AppState, PermissionsAndroid, Platform } from "react-native";
import * as Linking from "expo-linking";
import { UNTITLED_CHAT, type ChatId } from "@/src/domain";
import { useChatsStore } from "@/src/stores/chats";
import { useMessagesStore } from "@/src/stores/messages";
import { useSettingsStore } from "@/src/stores/settings";
import { TURN_TASK_KEY, TurnNotifier, type TurnNotifierModule } from "@/modules/turn-notifier";

const SNIPPET_LENGTH = 300;
const PROMPT_TITLE_LENGTH = 60;
/**
 * The backend names a new chat alongside its first reply, and a short reply
 * can finish first; the chat list is re-read this many times, this far apart.
 */
const TITLE_ATTEMPTS = 4;
const TITLE_RETRY_MS = 2_000;

AppRegistry.registerHeadlessTask(TURN_TASK_KEY, () => () => new Promise<void>(() => {}));

export function watchTurns(): () => void {
  const notifier = TurnNotifier;
  if (!notifier) return () => {};
  let live = 0;
  let preparing = 0;
  let working = false;

  const syncWork = () => {
    if (live > 0) {
      if (!working) void askPermissionOnce();
      notifier.startWork(live === 1 ? "Working on a reply" : `Working on ${live} replies`);
      working = true;
    } else if (preparing === 0 && working) {
      notifier.stopWork();
      working = false;
    }
  };

  const post = (chatId: ChatId, body: string) => {
    preparing += 1;
    void notify(notifier, chatId, body).finally(() => {
      preparing -= 1;
      syncWork();
    });
  };

  const unsubscribe = useMessagesStore.subscribe((state, previous) => {
    const background = AppState.currentState !== "active";
    if (background) {
      for (const [chatId, active] of Object.entries(previous.activeTurns)) {
        if (!active || state.activeTurns[chatId]) continue;
        const body = endedBody(chatId);
        if (body) post(chatId, body);
      }
      if (state.forms !== previous.forms) {
        for (const [chatId, forms] of Object.entries(state.forms)) {
          const known = new Set((previous.forms[chatId] ?? []).map((form) => form.id));
          const fresh = forms.find((form) => !known.has(form.id));
          if (fresh) post(chatId, `Needs your answer: ${fresh.title}`);
        }
      }
    }
    if (state.activeTurns !== previous.activeTurns) {
      live = Object.values(state.activeTurns).filter(Boolean).length;
      syncWork();
    }
  });

  return () => {
    unsubscribe();
    if (working) notifier.stopWork();
  };
}

export function dismissTurnNotification(chatId: ChatId): void {
  TurnNotifier?.dismiss(chatId);
}

/** What to tell the user about a turn that just ended, or null for nothing. */
function endedBody(chatId: ChatId): string | null {
  const { byChat, turnErrors } = useMessagesStore.getState();
  const reply = (byChat[chatId] ?? []).findLast((message) => message.role === "assistant");
  // A stopped reply was stopped by the user; nothing to tell them.
  if (reply?.status === "complete") return snippet(reply.text, SNIPPET_LENGTH) || "Reply ready";
  if (reply?.status === "error" || turnErrors[chatId]) {
    return turnErrors[chatId] ?? "The reply failed.";
  }
  return null;
}

async function notify(notifier: TurnNotifierModule, chatId: ChatId, body: string): Promise<void> {
  const title = (await backendTitle(chatId)) ?? promptTitle(chatId) ?? "OpenChat";
  notifier.notify(chatId, title, body, Linking.createURL(`chat/${chatId}`));
}

async function backendTitle(chatId: ChatId): Promise<string | null> {
  for (let attempt = 0; attempt < TITLE_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, TITLE_RETRY_MS));
    await useChatsStore
      .getState()
      .refresh()
      .catch(() => undefined);
    const title = useChatsStore.getState().chats.find((chat) => chat.id === chatId)?.title;
    if (title && title !== UNTITLED_CHAT) return title;
  }
  return null;
}

/** The chat's first prompt, standing in for a name the backend has not given it. */
function promptTitle(chatId: ChatId): string | null {
  const first = useMessagesStore
    .getState()
    .byChat[chatId]?.find((message) => message.role === "user" && message.text.trim());
  return first ? snippet(first.text, PROMPT_TITLE_LENGTH) : null;
}

/** Text as plain prose: a notification shows markdown syntax verbatim. */
function snippet(text: string, length: number): string {
  const flat = text
    .replace(/^\s*(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*`~]+/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
}

/**
 * Android 13+ asks once, when the first reply starts: that is when the
 * notifications become useful. Declining is final; the system settings can
 * turn them on later.
 */
async function askPermissionOnce(): Promise<void> {
  if (Platform.OS !== "android" || Platform.Version < 33) return;
  const settings = useSettingsStore.getState();
  if (settings.notificationsAsked) return;
  settings.markNotificationsAsked();
  await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(
    () => undefined,
  );
}
