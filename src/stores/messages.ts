/**
 * Messages store — per-chat message transcripts.
 *
 * Chats persist to MMKV (keyed per chat) so history survives restarts and
 * feeds reconciliation: a chat opened offline still shows its cached
 * transcript until the server answers. All backend work goes through
 * `ChatProvider`; the streaming state machine (src/stream/) drives the
 * live updates.
 */

import type { ChatId, Message } from "@/src/domain";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { getProvider } from "@/src/lib/providerFactory";
import { mmkvStorage } from "./storage";

interface MessagesStoreState {
  byChat: Record<ChatId, Message[]>;
  loading: Record<ChatId, boolean>;
  /** Chats with a live streaming turn (runtime only; never persisted). */
  activeTurns: Record<ChatId, boolean>;
  /** Last failed turn per chat, as a user-facing message (runtime only). */
  turnErrors: Record<ChatId, string | null>;
  /** Replaces the whole transcript of a chat (reconcile / cold open). */
  setMessages: (chatId: ChatId, messages: Message[]) => void;
  appendMessage: (chatId: ChatId, message: Message) => void;
  patchMessage: (chatId: ChatId, messageId: string, patch: Partial<Message>) => void;
  removeMessage: (chatId: ChatId, messageId: string) => void;
  removeMessages: (chatId: ChatId, messageIds: string[]) => void;
  removeChat: (chatId: ChatId) => void;
  setTurnActive: (chatId: ChatId, active: boolean) => void;
  setTurnError: (chatId: ChatId, error: string | null) => void;
  fetchMessages: (chatId: ChatId) => Promise<void>;
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

function stripAttachmentBytes(byChat: Record<ChatId, Message[]>): Record<ChatId, Message[]> {
  const stripped: Record<ChatId, Message[]> = {};
  for (const [chatId, messages] of Object.entries(byChat)) {
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
  }
  return stripped;
}

export function createMessagesStore(storage = mmkvStorage) {
  return create<MessagesStoreState>()(
    persist(
      (set) => ({
        byChat: {},
        loading: {},
        activeTurns: {},
        turnErrors: {},
        setTurnActive: (chatId, active) =>
          set((state) => ({ activeTurns: { ...state.activeTurns, [chatId]: active } })),
        setTurnError: (chatId, error) =>
          set((state) => ({ turnErrors: { ...state.turnErrors, [chatId]: error } })),
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
            return { byChat };
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
            set((state) => ({
              byChat: { ...state.byChat, [chatId]: normalizeTranscript(messages) },
              loading: { ...state.loading, [chatId]: false },
            }));
          } catch {
            // Keep the cached transcript on failure; the reconnect machinery
            // (src/stream/) retries when connectivity returns.
            set((state) => ({ loading: { ...state.loading, [chatId]: false } }));
          }
        },
      }),
      {
        name: "messages",
        storage: createJSONStorage(() => storage),
        // Only the transcript persists. Attachment payloads are left out: they
        // are megabytes of base64 and this store is written on every streaming
        // delta. The bytes come back with the next transcript read from the
        // server, so a cached transcript shows attachment names without
        // previews until then.
        partialize: (state) => ({ byChat: stripAttachmentBytes(state.byChat) }),
      },
    ),
  );
}

export const useMessagesStore = createMessagesStore();
