/**
 * Tests for the per-chat streaming state machine, driven by a scripted
 * fake ChatProvider (no network, no adapter).
 */

import type { ChatId, Message, StreamEvent } from "@/src/domain";
import type { ChatProvider } from "@/src/providers/types";
import { getProvider } from "@/src/lib/providerFactory";
import {
  discardPendingRegenerate,
  interruptTurn,
  isTurnLive,
  regenerateReply,
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
  useChatsStore.setState({ chats: [], loading: false, error: null, pendingRegenerate: {} });
}

async function flush(times = 8) {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

beforeEach(() => {
  resetStores();
  getProviderMock.mockReset();
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

describe("regenerateReply", () => {
  const serverTurn = (): Message[] => [
    { id: "msg_u1", role: "user", text: "older", status: "complete", createdAt: 1 },
    { id: "msg_a1", role: "assistant", text: "old reply", status: "complete", createdAt: 2 },
    { id: "msg_u2", role: "user", text: "again", status: "complete", createdAt: 3 },
    { id: "msg_a2", role: "assistant", text: "first reply", status: "complete", createdAt: 4 },
  ];

  it("asks a native backend to replace the turn and streams the new reply", async () => {
    const order: string[] = [];
    const prepareRegenerate = jest.fn().mockImplementation(async () => {
      order.push("prepare");
    });
    const regenerate = jest.fn().mockImplementation(async () => {
      order.push("deliver");
    });
    const provider = makeProvider({
      capabilities: { ...makeProvider().capabilities, regenerate: true },
      prepareRegenerate,
      regenerate,
      send: jest.fn(),
      fetchMessages: jest.fn().mockResolvedValue(serverTurn()),
      events: jest.fn().mockImplementation((chatId: ChatId, signal?: AbortSignal) => {
        order.push("subscribe");
        return scriptedEvents([{ events: [textDelta("second reply"), chatIdle()] }])(
          chatId,
          signal,
        );
      }),
    });
    getProviderMock.mockResolvedValue(provider);
    useMessagesStore.getState().setMessages("c20", serverTurn());

    const outcome = await regenerateReply("c20");

    expect(outcome).toEqual({ ok: true });
    expect(prepareRegenerate).toHaveBeenCalledWith(
      "c20",
      expect.objectContaining({ id: "msg_u2", text: "again" }),
    );
    expect(regenerate).toHaveBeenCalledWith(
      "c20",
      expect.objectContaining({ id: "msg_u2", text: "again" }),
    );
    expect(provider.send).not.toHaveBeenCalled();
    // The rollback is prepared before the rerun's events are subscribed, so
    // the bookkeeping events it causes cannot end the new turn.
    expect(order).toEqual(["prepare", "subscribe", "deliver"]);
    // The replaced turn is gone; the rerun leaves one user message and one reply.
    const transcript = useMessagesStore.getState().byChat.c20;
    expect(transcript.filter((message) => message.role === "user")).toHaveLength(2);
    expect(transcript[transcript.length - 1]).toMatchObject({
      role: "assistant",
      text: "second reply",
      status: "complete",
    });
    expect(transcript.some((message) => message.text === "first reply")).toBe(false);
  });

  it("abandons the prepared rollback and starts no turn when preparation fails", async () => {
    const discardRegenerate = jest.fn().mockResolvedValue(undefined);
    const provider = makeProvider({
      capabilities: { ...makeProvider().capabilities, regenerate: true },
      prepareRegenerate: jest.fn().mockRejectedValue(new Error("Session is busy")),
      regenerate: jest.fn(),
      discardRegenerate,
      fetchMessages: jest.fn().mockResolvedValue(serverTurn()),
      events: jest.fn(),
    });
    getProviderMock.mockResolvedValue(provider);
    useMessagesStore.getState().setMessages("c32", serverTurn());

    await regenerateReply("c32");

    expect(discardRegenerate).toHaveBeenCalledWith("c32");
    expect(provider.regenerate).not.toHaveBeenCalled();
    expect(provider.events).not.toHaveBeenCalled();
    expect(useMessagesStore.getState().turnErrors.c32).toBe("Session is busy");
    // Nothing was taken off the transcript.
    expect(useMessagesStore.getState().byChat.c32).toHaveLength(4);
    expect(useChatsStore.getState().pendingRegenerate.c32).toBeUndefined();
  });

  it("re-sends app-side when the backend cannot rerun natively", async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const provider = makeProvider({
      send,
      fetchMessages: jest.fn().mockResolvedValue(serverTurn()),
      events: scriptedEvents([{ events: [chatIdle()] }]),
    });
    getProviderMock.mockResolvedValue(provider);
    useMessagesStore.getState().setMessages("c21", serverTurn());

    await regenerateReply("c21");

    expect(send).toHaveBeenCalledWith("c21", expect.objectContaining({ text: "again" }));
    // Nothing was rolled back server-side, so the previous turn keeps its
    // place and the rerun lands underneath it.
    const transcript = useMessagesStore.getState().byChat.c21;
    expect(transcript.filter((message) => message.role === "user")).toHaveLength(3);
    expect(transcript.some((message) => message.text === "first reply")).toBe(true);
  });

  it("keeps the staged-rerun marker only while the rerun is undelivered", async () => {
    const provider = makeProvider({
      capabilities: { ...makeProvider().capabilities, regenerate: true },
      regenerate: jest.fn().mockRejectedValue(new Error("Session is busy")),
      fetchMessages: jest.fn().mockResolvedValue(serverTurn()),
      events: scriptedEvents([{ events: [], drop: true }]),
    });
    getProviderMock.mockResolvedValue(provider);
    useMessagesStore.getState().setMessages("c22", serverTurn());

    await regenerateReply("c22");

    expect(useChatsStore.getState().pendingRegenerate.c22).toBeUndefined();
    expect(useMessagesStore.getState().turnErrors.c22).toBe("Session is busy");
  });

  it("records the marker while the rollback is armed, so a crash leaves it behind", async () => {
    let duringPrepare: string | undefined;
    let duringDeliver: string | undefined;
    const provider = makeProvider({
      capabilities: { ...makeProvider().capabilities, regenerate: true },
      prepareRegenerate: jest.fn().mockImplementation(async () => {
        duringPrepare = useChatsStore.getState().pendingRegenerate.c23;
      }),
      regenerate: jest.fn().mockImplementation(async () => {
        duringDeliver = useChatsStore.getState().pendingRegenerate.c23;
      }),
      fetchMessages: jest.fn().mockResolvedValue(serverTurn()),
      events: scriptedEvents([{ events: [chatIdle()] }]),
    });
    getProviderMock.mockResolvedValue(provider);
    useMessagesStore.getState().setMessages("c23", serverTurn());

    await regenerateReply("c23");

    expect(duringPrepare).toBe("msg_u2");
    expect(duringDeliver).toBe("msg_u2");
    // Delivered: the rollback was committed with the prompt, nothing left armed.
    expect(useChatsStore.getState().pendingRegenerate.c23).toBeUndefined();
  });

  it("refuses while a turn is live", async () => {
    const provider = makeProvider({
      events: scriptedEvents([{ events: [textDelta("Hel")] }]), // parks
    });
    getProviderMock.mockResolvedValue(provider);
    const done = sendMessage("c24", "hi");
    await flush();

    await expect(regenerateReply("c24")).resolves.toEqual({
      ok: false,
      error: "Wait for the current reply to finish.",
    });

    await interruptTurn("c24");
    await done;
  }, 10_000);

  it("refuses when the chat has no user message to re-run", async () => {
    const provider = makeProvider({ fetchMessages: jest.fn().mockResolvedValue([]) });
    getProviderMock.mockResolvedValue(provider);
    useMessagesStore.getState().setMessages("c25", []);

    await expect(regenerateReply("c25")).resolves.toMatchObject({ ok: false });
  });

  it("refuses when the transcript still holds a locally sent message", async () => {
    const provider = makeProvider({
      capabilities: { ...makeProvider().capabilities, regenerate: true },
      regenerate: jest.fn(),
      // The server has nothing yet: the turn is still only on this device.
      fetchMessages: jest.fn().mockResolvedValue([]),
    });
    getProviderMock.mockResolvedValue(provider);
    useMessagesStore
      .getState()
      .setMessages("c26", [
        { id: "user-local-1", role: "user", text: "hi", status: "complete", createdAt: 1 },
      ]);

    await expect(regenerateReply("c26")).resolves.toEqual({
      ok: false,
      error: "There is nothing to regenerate yet.",
    });
    expect(provider.regenerate).not.toHaveBeenCalled();
  });

  it("refuses when an attachment lost its payload", async () => {
    const provider = makeProvider({
      capabilities: { ...makeProvider().capabilities, regenerate: true },
      regenerate: jest.fn(),
      fetchMessages: jest.fn().mockResolvedValue([
        {
          id: "msg_u",
          role: "user",
          text: "see",
          status: "complete",
          createdAt: 1,
          attachments: [{ uri: "", mimeType: "image/png", name: "photo.png", size: 3 }],
        },
        { id: "msg_a", role: "assistant", text: "ok", status: "complete", createdAt: 2 },
      ]),
    });
    getProviderMock.mockResolvedValue(provider);

    await expect(regenerateReply("c27")).resolves.toEqual({
      ok: false,
      error: "The attached file is no longer available. Re-attach it and try again.",
    });
    expect(provider.regenerate).not.toHaveBeenCalled();
  });

  it("re-runs a turn that carries attachments", async () => {
    const attachment = {
      uri: "",
      mimeType: "image/png",
      name: "photo.png",
      bytes: "QUJD",
      size: 3,
    };
    const regenerate = jest.fn().mockResolvedValue(undefined);
    const provider = makeProvider({
      capabilities: { ...makeProvider().capabilities, regenerate: true },
      regenerate,
      fetchMessages: jest.fn().mockResolvedValue([
        {
          id: "msg_u",
          role: "user",
          text: "look",
          status: "complete",
          createdAt: 1,
          attachments: [attachment],
        },
        { id: "msg_a", role: "assistant", text: "red", status: "complete", createdAt: 2 },
      ]),
      events: scriptedEvents([{ events: [chatIdle()] }]),
    });
    getProviderMock.mockResolvedValue(provider);

    await regenerateReply("c28");

    expect(regenerate).toHaveBeenCalledWith(
      "c28",
      expect.objectContaining({ id: "msg_u", attachments: [attachment] }),
    );
  });

  it("reports not connected without touching the transcript", async () => {
    getProviderMock.mockResolvedValue(null);
    useMessagesStore.getState().setMessages("c29", serverTurn());

    await expect(regenerateReply("c29")).resolves.toEqual({
      ok: false,
      error: "Not connected. Open Settings to connect.",
    });
    expect(useMessagesStore.getState().byChat.c29).toHaveLength(4);
  });
});

describe("discardPendingRegenerate", () => {
  it("drops a staged rerun on the server and clears the marker", async () => {
    const discardRegenerate = jest.fn().mockResolvedValue(undefined);
    const provider = makeProvider({ discardRegenerate });
    getProviderMock.mockResolvedValue(provider);
    useChatsStore.getState().markPendingRegenerate("c30", "msg_9");

    await discardPendingRegenerate("c30");

    expect(discardRegenerate).toHaveBeenCalledWith("c30");
    expect(useChatsStore.getState().pendingRegenerate.c30).toBeUndefined();
  });

  it("clears the marker even when the backend cannot be reached", async () => {
    const provider = makeProvider({
      discardRegenerate: jest.fn().mockRejectedValue(new Error("offline")),
    });
    getProviderMock.mockResolvedValue(provider);
    useChatsStore.getState().markPendingRegenerate("c31", "msg_9");

    await expect(discardPendingRegenerate("c31")).resolves.toBeUndefined();
    expect(useChatsStore.getState().pendingRegenerate.c31).toBeUndefined();
  });
});
