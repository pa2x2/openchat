/**
 * The OpenCode V2 adapter — the only place in the app that knows the
 * OpenCode API.
 */

import type {
  ChatId,
  ChatSummary,
  Capabilities,
  Message,
  ModelInfo,
  ModelRef,
  StreamEvent,
  UserMessage,
} from "@/src/domain";
import type { ChatProvider, ConnectionConfig, ConnectionInfo } from "@/src/providers/types";
import {
  createOpenCodeClient,
  timeoutSignal,
  toConnectionError,
  type OpenCodeClient,
} from "./client";
import { chatEvents } from "./events";
import { fetchMessages } from "./messages";
import { listModels } from "./models";
import { interrupt, send } from "./prompt";
import { createChat, deleteChat, listChats, switchModel } from "./sessions";

export const openCodeCapabilities: Capabilities = {
  reasoning: true,
  attachments: true,
  interrupt: true,
  // No native regenerate on the server; the app re-sends instead.
  regenerate: false,
  modelSelection: true,
  deleteChat: true,
};

export class OpenCodeProvider implements ChatProvider {
  readonly id = "opencode";
  readonly capabilities = openCodeCapabilities;

  private readonly cfg: ConnectionConfig;
  private readonly clientFactory: (cfg: ConnectionConfig) => OpenCodeClient;

  constructor(cfg: ConnectionConfig, clientFactory?: (cfg: ConnectionConfig) => OpenCodeClient) {
    this.cfg = cfg;
    this.clientFactory = clientFactory ?? createOpenCodeClient;
  }

  private client(): OpenCodeClient {
    return this.clientFactory(this.cfg);
  }

  async connect(): Promise<ConnectionInfo> {
    const client = this.client();
    const timeout = timeoutSignal(10_000);
    try {
      const info = await client.server.info({ signal: timeout.signal });
      return { serverVersion: info.version };
    } catch (error) {
      throw toConnectionError(error);
    } finally {
      timeout.done();
    }
  }

  listModels(): Promise<ModelInfo[]> {
    return listModels(this.client());
  }

  listChats(): Promise<ChatSummary[]> {
    return listChats(this.client());
  }

  createChat(opts?: { model?: ModelRef; title?: string }): Promise<ChatSummary> {
    return createChat(this.client(), opts);
  }

  deleteChat(id: ChatId): Promise<void> {
    return deleteChat(this.client(), id);
  }

  setChatModel(id: ChatId, model: ModelRef): Promise<void> {
    return switchModel(this.client(), id, model);
  }

  send(chatId: ChatId, msg: UserMessage): Promise<void> {
    return send(this.client(), chatId, msg);
  }

  interrupt(chatId: ChatId): Promise<void> {
    return interrupt(this.client(), chatId);
  }

  events(chatId: ChatId, signal?: AbortSignal): AsyncIterable<StreamEvent> {
    return chatEvents(this.client(), chatId, signal ?? new AbortController().signal);
  }

  fetchMessages(chatId: ChatId): Promise<Message[]> {
    return fetchMessages(this.client(), chatId);
  }
}
