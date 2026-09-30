/**
 * Messages store — per-chat message transcripts.
 *
 * Chats persist to MMKV (keyed per chat) so history survives restarts and
 * feeds reconciliation: a chat opened offline still shows its cached
 * transcript until the server answers. All backend work goes through
 * `ChatProvider`; the streaming state machine (src/stream/) drives the
 * live updates.
 */

import type { ChatForm, ChatId, Message, TurnActivity } from "@/src/domain";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { getProvider } from "@/src/lib/providerFactory";
import { placedFormRecords, withFormRecords, type FormRecord } from "./formRecords";
import { createThrottledJSONStorage, mmkvStorage } from "./storage";

/**
 * Streaming patches the transcript once per delta; persisting is throttled
 * to this, so the store is written about once a second instead.
 */
const PERSIST_INTERVAL_MS = 1_000;

interface MessagesStoreState {
  byChat: Record<ChatId, Message[]>;
  loading: Record<ChatId, boolean>;
  /** Chats with a live streaming turn (runtime only; never persisted). */
  activeTurns: Record<ChatId, boolean>;
  /** Last failed turn per chat, as a user-facing message (runtime only). */
  turnErrors: Record<ChatId, string | null>;
  /** Forms the backend is waiting on, oldest first (runtime only). */
  forms: Record<ChatId, ChatForm[]>;
  /** Settled forms the server transcript has no trace of, in the order they were settled. */
  formRecords: Record<ChatId, FormRecord[]>;
  /** What the live turn is doing; null while it writes text or no turn runs (runtime only). */
  activity: Record<ChatId, TurnActivity | null>;
  /** Replaces the whole transcript of a chat (reconcile / cold open). */
  setMessages: (chatId: ChatId, messages: Message[]) => void;
  appendMessage: (chatId: ChatId, message: Message) => void;
  patchMessage: (chatId: ChatId, messageId: string, patch: Partial<Message>) => void;
  removeMessage: (chatId: ChatId, messageId: string) => void;
  removeMessages: (chatId: ChatId, messageIds: string[]) => void;
  removeChat: (chatId: ChatId) => void;
  setTurnActive: (chatId: ChatId, active: boolean) => void;
  setTurnError: (chatId: ChatId, error: string | null) => void;
  setActivity: (chatId: ChatId, activity: TurnActivity | null) => void;
  fetchMessages: (chatId: ChatId) => Promise<void>;
  setForms: (chatId: ChatId, forms: ChatForm[]) => void;
  addForm: (chatId: ChatId, form: ChatForm) => void;
  removeForm: (chatId: ChatId, formId: string) => void;
  addFormRecord: (chatId: ChatId, record: FormRecord) => void;
}

function sortMessages(messages: Message[]): Message[] {
  // Server transcripts come oldest-first; keep that order on screen.
  return [...messages].sort((a, b) => a.createdAt - b.createdAt);
}

function normalizeTranscript(messages: Message[]): Message[] {
  const seen = new Set<string>();
  return sortMessages(
    messages.filter((message) => {
      if (seen.has(message.id)) return false;
      seen.add(message.id);
      return true;
    }),
  );
}

// Persist partializes on every change. Transcripts are immutable, so caching
// by array keeps that to the one chat that changed rather than all of them.
const strippedTranscripts = new WeakMap<Message[], Message[]>();

function stripAttachmentBytes(byChat: Record<ChatId, Message[]>): Record<ChatId, Message[]> {
  const stripped: Record<ChatId, Message[]> = {};
  for (const [chatId, messages] of Object.entries(byChat)) {
    const cached = strippedTranscripts.get(messages);
    if (cached) {
      stripped[chatId] = cached;
      continue;
    }
    stripped[chatId] = messages.map((message) => {
      if (!message.attachments) return message;
      return {
        ...message,
        attachments: message.attachments.map((attachment) => ({
          uri: attachment.uri,
          mimeType: attachment.mimeType,
          name: attachment.name,
          ...(attachment.size !== undefined ? { size: attachment.size } : {}),
        })),
      };
    });
    strippedTranscripts.set(messages, stripped[chatId]);
  }
  return stripped;
}

/** `persistIntervalMs` of 0 writes every change immediately. */
export function createMessagesStore(
  storage = mmkvStorage,
  persistIntervalMs = PERSIST_INTERVAL_MS,
) {
  return create<MessagesStoreState>()(
    persist(
      (set) => ({
        byChat: {},
        loading: {},
        activeTurns: {},
        turnErrors: {},
        forms: {},
        formRecords: {},
        activity: {},
        setForms: (chatId, forms) =>
          set((state) => ({ forms: { ...state.forms, [chatId]: forms } })),
        // The same form can arrive live and from a pending-forms sync.
        addForm: (chatId, form) =>
          set((state) => {
            const existing = state.forms[chatId] ?? [];
            if (existing.some((candidate) => candidate.id === form.id)) return state;
            return { forms: { ...state.forms, [chatId]: [...existing, form] } };
          }),
        removeForm: (chatId, formId) =>
          set((state) => {
            const existing = state.forms[chatId];
            if (!existing?.some((form) => form.id === formId)) return state;
            return {
              forms: { ...state.forms, [chatId]: existing.filter((form) => form.id !== formId) },
            };
          }),
        addFormRecord: (chatId, record) =>
          set((state) => ({
            formRecords: {
              ...state.formRecords,
              [chatId]: [...(state.formRecords[chatId] ?? []), record],
            },
          })),
        setTurnActive: (chatId, active) =>
          set((state) => ({ activeTurns: { ...state.activeTurns, [chatId]: active } })),
        setTurnError: (chatId, error) =>
          set((state) => ({ turnErrors: { ...state.turnErrors, [chatId]: error } })),
        setActivity: (chatId, activity) =>
          set((state) => ({ activity: { ...state.activity, [chatId]: activity } })),
        setMessages: (chatId, messages) =>
          set((state) => ({
            byChat: {
              ...state.byChat,
              [chatId]: normalizeTranscript(messages),
            },
          })),
        appendMessage: (chatId, message) =>
          set((state) => {
            const existing = state.byChat[chatId] ?? [];
            if (existing.some((m) => m.id === message.id)) return state;
            return { byChat: { ...state.byChat, [chatId]: [...existing, message] } };
          }),
        patchMessage: (chatId, messageId, patch) =>
          set((state) => {
            const existing = state.byChat[chatId];
            if (!existing) return state;
            return {
              byChat: {
                ...state.byChat,
                [chatId]: existing.map((message) =>
                  message.id === messageId ? { ...message, ...patch } : message,
                ),
              },
            };
          }),
        removeMessage: (chatId, messageId) =>
          set((state) => {
            const existing = state.byChat[chatId];
            if (!existing) return state;
            return {
              byChat: {
                ...state.byChat,
                [chatId]: existing.filter((message) => message.id !== messageId),
              },
            };
          }),
        removeMessages: (chatId, messageIds) =>
          set((state) => {
            const existing = state.byChat[chatId];
            if (!existing) return state;
            const drop = new Set(messageIds);
            return {
              byChat: {
                ...state.byChat,
                [chatId]: existing.filter((message) => !drop.has(message.id)),
              },
            };
          }),
        removeChat: (chatId) =>
          set((state) => {
            const byChat = { ...state.byChat };
            delete byChat[chatId];
            const formRecords = { ...state.formRecords };
            delete formRecords[chatId];
            return { byChat, formRecords };
          }),
        fetchMessages: async (chatId) => {
          set((state) => ({ loading: { ...state.loading, [chatId]: true } }));
          try {
            const provider = await getProvider();
            if (!provider) {
              set((state) => ({ loading: { ...state.loading, [chatId]: false } }));
              return;
            }
            const messages = await provider.fetchMessages(chatId);
            // Server truth wins; the cached transcript is replaced wholesale.
            // Only this device's form records go back in, and those whose
            // reply the server no longer has are dropped.
            set((state) => {
              const known = state.formRecords[chatId];
              const records = known ? placedFormRecords(messages, known) : undefined;
              return {
                byChat: {
                  ...state.byChat,
                  [chatId]: normalizeTranscript(withFormRecords(messages, records)),
                },
                ...(records ? { formRecords: { ...state.formRecords, [chatId]: records } } : {}),
                loading: { ...state.loading, [chatId]: false },
              };
            });
          } catch {
            // Keep the cached transcript on failure; the reconnect machinery
            // (src/stream/) retries when connectivity returns.
            set((state) => ({ loading: { ...state.loading, [chatId]: false } }));
          }
        },
      }),
      {
        name: "messages",
        storage:
          persistIntervalMs > 0
            ? createThrottledJSONStorage(() => storage, persistIntervalMs)
            : createJSONStorage(() => storage),
        // Only the transcript and the form records persist. Attachment
        // payloads are left out: they are megabytes of base64 that would be
        // rewritten throughout every streamed reply. The bytes come back with
        // the next transcript read from the server, so a cached transcript
        // shows attachment names without previews until then.
        partialize: (state) => ({
          byChat: stripAttachmentBytes(state.byChat),
          formRecords: state.formRecords,
        }),
      },
    ),
  );
}

export const useMessagesStore = createMessagesStore();
