/**
 * Tests for the per-chat streaming state machine, driven by a scripted
 * fake ChatProvider (no network, no adapter).
 */

import type { ChatId, Message, StreamEvent } from "@/src/domain";
import type { ChatProvider } from "@/src/providers/types";
import { getProvider } from "@/src/lib/providerFactory";
import {
  interruptTurn,
  isTurnLive,
  sendMessage,
  settleOrphanedStreams,
} from "@/src/stream/streamMachine";
import { useChatsStore } from "@/src/stores/chats";
import { useMessagesStore } from "@/src/stores/messages";

jest.mock("@/src/lib/providerFactory", () => ({
  getProvider: jest.fn(),
}));

const getProviderMock = getProvider as jest.Mock;

/** One event-stream subscription: the events it yields, then either the
 * connection drops (or the turn ends without further events) — the
 * generator parks like a live stream until aborted unless `drop`. */
interface Script {
  events: StreamEvent[];
  drop?: boolean;
}

function scriptedEvents(scripts: Script[]): ChatProvider["events"] {
  let call = 0;
  return jest.fn((_chatId: ChatId, signal?: AbortSignal) =>
    (async function* () {
      const script = scripts[Math.min(call, scripts.length - 1)];
      call += 1;
      for (const event of script.events) {
        if (signal?.aborted) return;
        yield event;
      }
      if (script.drop) return;
      // Park like a real stream: stay open until the caller aborts.
      await new Promise<void>((resolve) => {
        if (signal?.aborted) {
          resolve();
          return;
        }
        signal?.addEventListener("abort", () => resolve(), { once: true });
      });
    })(),
  );
}

const textDelta = (text: string): StreamEvent => ({ type: "text-delta", text });
const chatIdle = (): StreamEvent => ({ type: "chat-idle" });
const streamError = (message: string, retryable = false): StreamEvent => ({
  type: "error",
  message,
  retryable,
});

function makeProvider(overrides: Partial<ChatProvider> = {}): ChatProvider {
  return {
    id: "opencode",
    capabilities: {
      reasoning: true,
      attachments: true,
      interrupt: true,
      regenerate: false,
      modelSelection: true,
      deleteChat: true,
    },
    connect: jest.fn(),
    listModels: jest.fn(),
    listChats: jest.fn().mockResolvedValue([]),
    createChat: jest.fn(),
    deleteChat: jest.fn(),
    setChatModel: jest.fn().mockResolvedValue(undefined),
    send: jest.fn().mockResolvedValue(undefined),
    interrupt: jest.fn().mockResolvedValue(undefined),
    events: jest.fn(),
    fetchMessages: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function assistantMessage(patch: Partial<Message> = {}): Message {
  return {
    id: "a1",
    role: "assistant",
    text: "",
    status: "interrupted",
    createdAt: 2,
    ...patch,
  };
}

function resetStores() {
  useMessagesStore.setState({ byChat: {}, activeTurns: {}, turnErrors: {} });
  useChatsStore.setState({ chats: [], loading: false, error: null });
}

async function flush(times = 8) {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

beforeEach(() => {
  resetStores();
  getProviderMock.mockReset();
  jest.spyOn(Date, "now").mockRestore?.();
});

describe("sendMessage", () => {
  it("streams deltas into the assistant message and completes on chat-idle", async () => {
    const provider = makeProvider({
      events: scriptedEvents([{ events: [textDelta("Hel"), textDelta("lo"), chatIdle()] }]),
    });
    getProviderMock.mockResolvedValue(provider);

    await sendMessage("c1", "hi");

    const transcript = useMessagesStore.getState().byChat.c1;
    expect(transcript).toHaveLength(2);
    expect(transcript[0]).toMatchObject({ role: "user", text: "hi", status: "complete" });
    expect(transcript[1]).toMatchObject({
      role: "assistant",
      text: "Hello",
      status: "complete",
    });
    expect(provider.send).toHaveBeenCalledWith("c1", expect.objectContaining({ text: "hi" }));
    expect(useMessagesStore.getState().activeTurns.c1).toBe(false);
    expect(useMessagesStore.getState().turnErrors.c1 ?? null).toBeNull();
  });

  it("shows a reasoning delta on the assistant message", async () => {
    const provider = makeProvider({
      events: scriptedEvents([
        { events: [{ type: "reasoning-delta", text: "thinking" }, chatIdle()] },
      ]),
    });
    getProviderMock.mockResolvedValue(provider);

    await sendMessage("c1", "hi");

    expect(useMessagesStore.getState().byChat.c1[1]).toMatchObject({
      reasoning: "thinking",
      status: "complete",
    });
  });

  it("marks the turn failed when prompt delivery fails", async () => {
    const provider = makeProvider({
      send: jest.fn().mockRejectedValue(new Error("boom")),
      events: scriptedEvents([{ events: [], drop: true }]),
    });
    getProviderMock.mockResolvedValue(provider);

    await sendMessage("c2", "hi");

    const transcript = useMessagesStore.getState().byChat.c2;
    expect(transcript[0]).toMatchObject({ role: "user", text: "hi" }); // not lost
    expect(transcript[1]).toMatchObject({ role: "assistant", status: "error" });
    expect(useMessagesStore.getState().turnErrors.c2).toBe("boom");
    expect(useMessagesStore.getState().activeTurns.c2).toBe(false);
  });

  it("marks the turn failed on a non-retryable stream error", async () => {
    const provider = makeProvider({
      events: scriptedEvents([
        { events: [streamError("Model X is not available", false)], drop: true },
      ]),
    });
    getProviderMock.mockResolvedValue(provider);

    await sendMessage("c3", "hi");

    expect(useMessagesStore.getState().byChat.c3[1]).toMatchObject({ status: "error" });
    expect(useMessagesStore.getState().turnErrors.c3).toBe("Model X is not available");
  });

  it("explains a run that went idle without producing a reply", async () => {
    const provider = makeProvider({
      events: scriptedEvents([{ events: [chatIdle()], drop: true }]),
    });
    getProviderMock.mockResolvedValue(provider);

    await sendMessage("c3c", "hi");

    expect(useMessagesStore.getState().byChat.c3c[1]).toMatchObject({ status: "error" });
    expect(useMessagesStore.getState().turnErrors.c3c).toContain("without returning a reply");
    expect(useMessagesStore.getState().activeTurns.c3c).toBe(false);
  });

  it("ends immediately on a terminal server error without reconciling", async () => {
    const provider = makeProvider({
      events: scriptedEvents([
        { events: [streamError("Provider authentication failed", false)], drop: true },
      ]),
      fetchMessages: jest.fn(),
    });
    getProviderMock.mockResolvedValue(provider);

    await sendMessage("c3b", "hi");

    expect(useMessagesStore.getState().byChat.c3b[1]).toMatchObject({ status: "error" });
    expect(useMessagesStore.getState().turnErrors.c3b).toBe("Provider authentication failed");
    expect(provider.fetchMessages).not.toHaveBeenCalled();
    expect(useMessagesStore.getState().activeTurns.c3b).toBe(false);
  });

  it("fails the turn when no provider is available", async () => {
    getProviderMock.mockResolvedValue(null);

    await sendMessage("c4", "hi");

    expect(useMessagesStore.getState().turnErrors.c4).toContain("Not connected");
    expect(useMessagesStore.getState().activeTurns.c4).toBe(false);
  });
});

describe("interruptTurn", () => {
  it("marks a streaming message interrupted and calls the provider", async () => {
    const provider = makeProvider({
      events: scriptedEvents([{ events: [textDelta("Hel")] }]), // parks after delta
    });
    getProviderMock.mockResolvedValue(provider);

    const done = sendMessage("c5", "hi");
    await flush();
    expect(isTurnLive("c5")).toBe(true);

    await interruptTurn("c5");
    await done;

    expect(useMessagesStore.getState().byChat.c5[1]).toMatchObject({
      text: "Hel",
      status: "interrupted",
    });
    expect(provider.interrupt).toHaveBeenCalledWith("c5");
    expect(useMessagesStore.getState().activeTurns.c5).toBe(false);
    expect(isTurnLive("c5")).toBe(false);
  }, 10_000);

  it("settles the send promise when a provider iterator ignores abort", async () => {
    const provider = makeProvider({
      events: jest.fn(() =>
        (async function* () {
          yield textDelta("partial");
          await new Promise<void>(() => undefined);
        })(),
      ),
    });
    getProviderMock.mockResolvedValue(provider);

    const done = sendMessage("c5b", "hi");
    await flush();
    await interruptTurn("c5b");
    await done;

    expect(useMessagesStore.getState().byChat.c5b[1]).toMatchObject({
      text: "partial",
      status: "interrupted",
    });
    expect(useMessagesStore.getState().activeTurns.c5b).toBe(false);
  });

  it("removes the empty placeholder when nothing streamed yet", async () => {
    const provider = makeProvider({
      events: scriptedEvents([{ events: [] }]), // parks before any delta
    });
    getProviderMock.mockResolvedValue(provider);

    const done = sendMessage("c6", "hi");
    await flush();

    await interruptTurn("c6");
    await done;

    const transcript = useMessagesStore.getState().byChat.c6;
    expect(transcript).toHaveLength(1);
    expect(transcript[0]).toMatchObject({ role: "user", text: "hi" });
  }, 10_000);
});

describe("mid-turn reconnection", () => {
  it("reconciles from fetchMessages and continues under the server id", async () => {
    const provider = makeProvider({
      events: scriptedEvents([
        { events: [textDelta("Hel")], drop: true }, // transport dies early
        { events: [textDelta("!"), chatIdle()] }, // resubscribe completes the turn
      ]),
      fetchMessages: jest.fn().mockResolvedValue([
        {
          id: "u1",
          role: "user",
          text: "hi",
          status: "complete",
          createdAt: 1,
        },
        assistantMessage({ text: "Hello", status: "interrupted" }),
      ]),
    });
    getProviderMock.mockResolvedValue(provider);

    await sendMessage("c7", "hi");

    const transcript = useMessagesStore.getState().byChat.c7;
    expect(provider.fetchMessages).toHaveBeenCalledWith("c7");
    // The optimistic user message was replaced by the server's copy.
    expect(transcript.map((m) => m.id)).toEqual(["u1", "a1"]);
    expect(transcript[1]).toMatchObject({
      text: "Hello!",
      status: "complete",
    });
    expect(useMessagesStore.getState().activeTurns.c7).toBe(false);
  });

  it("adopts an error snapshot as terminal without retrying", async () => {
    const provider = makeProvider({
      events: scriptedEvents([{ events: [streamError("connection lost", true)], drop: true }]),
      fetchMessages: jest.fn().mockResolvedValue([assistantMessage({ text: "", status: "error" })]),
    });
    getProviderMock.mockResolvedValue(provider);

    await sendMessage("c8b", "hi");

    expect(provider.fetchMessages).toHaveBeenCalledTimes(1);
    expect(useMessagesStore.getState().byChat.c8b[0]).toMatchObject({ status: "error" });
    expect(useMessagesStore.getState().turnErrors.c8b).toBe("The server reported an error.");
    expect(useMessagesStore.getState().activeTurns.c8b).toBe(false);
  });

  it("ends a turn whose closing events were lost, via agreeing snapshots", async () => {
    const provider = makeProvider({
      events: scriptedEvents([
        { events: [textDelta("Hel")], drop: true },
        { events: [], drop: true },
        { events: [], drop: true },
      ]),
      fetchMessages: jest
        .fn()
        .mockResolvedValueOnce([assistantMessage({ text: "Hello", status: "complete" })])
        .mockResolvedValue([assistantMessage({ text: "Hello", status: "complete" })]),
    });
    getProviderMock.mockResolvedValue(provider);

    await sendMessage("c8", "hi");

    const transcript = useMessagesStore.getState().byChat.c8;
    expect(transcript[0]).toMatchObject({ id: "a1", text: "Hello", status: "complete" });
    expect(useMessagesStore.getState().activeTurns.c8).toBe(false);
  });

  it("keeps streaming when a reconcile snapshot shows fresh server text", async () => {
    const provider = makeProvider({
      events: scriptedEvents([
        { events: [textDelta("Hel")], drop: true },
        { events: [chatIdle()] },
      ]),
      fetchMessages: jest
        .fn()
        .mockResolvedValueOnce([assistantMessage({ text: "Hello", status: "interrupted" })]),
    });
    getProviderMock.mockResolvedValue(provider);

    await sendMessage("c9", "hi");

    expect(useMessagesStore.getState().byChat.c9[0]).toMatchObject({
      id: "a1",
      text: "Hello",
      status: "complete",
    });
  });
});

describe("settleOrphanedStreams", () => {
  it("marks cached streaming messages interrupted when no turn is live", () => {
    useMessagesStore
      .getState()
      .setMessages("c10", [
        { id: "a1", role: "assistant", text: "partial", status: "streaming", createdAt: 1 },
      ]);
    settleOrphanedStreams("c10");
    expect(useMessagesStore.getState().byChat.c10[0]).toMatchObject({
      status: "interrupted",
    });
  });

  it("leaves transcripts alone while a turn is live for the chat", async () => {
    const provider = makeProvider({
      events: scriptedEvents([{ events: [textDelta("Hel")] }]), // parks
    });
    getProviderMock.mockResolvedValue(provider);
    const done = sendMessage("c11", "hi");
    await flush();

    settleOrphanedStreams("c11");

    expect(useMessagesStore.getState().byChat.c11[1]).toMatchObject({ status: "streaming" });
    await interruptTurn("c11");
    await done;
  }, 10_000);
});
