import { AppState } from "react-native";
import type { ChatId, Message, StreamEvent } from "@/src/domain";
import type { ChatProvider } from "@/src/providers/types";
import { getProvider } from "@/src/lib/providerFactory";
import {
  discardPendingRegenerate,
  interruptTurn,
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

/** One event subscription. Unless `drop`, the stream stays open after its
 * events until aborted, like a live connection. */
interface Script {
  events: StreamEvent[];
  drop?: boolean;
}

function scriptedEvents(scripts: Script[]): ChatProvider["events"] {
  let call = 0;
  return jest.fn((_chatId: ChatId, signal?: AbortSignal) =>
    (async function* () {
      const script = scripts[Math.min(call++, scripts.length - 1)];
      for (const event of script.events) {
        if (signal?.aborted) return;
        yield event;
      }
      if (script.drop || signal?.aborted) return;
      await new Promise((resolve) => signal?.addEventListener("abort", resolve, { once: true }));
    })(),
  );
}

const textDelta = (text: string): StreamEvent => ({ type: "text-delta", text });
const chatIdle = (): StreamEvent => ({ type: "chat-idle" });

function useProvider(overrides: Partial<ChatProvider> = {}): ChatProvider {
  const provider = {
    capabilities: { regenerate: false },
    send: jest.fn().mockResolvedValue(undefined),
    interrupt: jest.fn().mockResolvedValue(undefined),
    fetchMessages: jest.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as ChatProvider;
  getProviderMock.mockResolvedValue(provider);
  return provider;
}

const assistant = (patch: Partial<Message> = {}): Message => ({
  id: "a1",
  role: "assistant",
  text: "",
  status: "interrupted",
  createdAt: 2,
  ...patch,
});

const state = () => useMessagesStore.getState();

async function flush() {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

beforeEach(() => {
  useMessagesStore.setState({ byChat: {}, activeTurns: {}, turnErrors: {} });
  useChatsStore.setState({ chats: [], loading: false, error: null, pendingRegenerate: {} });
  getProviderMock.mockReset();
});

afterAll(() => {
  // Flush throttled transcript writes as backgrounding would; a pending
  // persist timer keeps the Jest worker from exiting.
  for (const [event, listener] of jest.mocked(AppState.addEventListener).mock.calls) {
    if (event === "change") listener("background");
  }
});

describe("sendMessage", () => {
  it("streams deltas into the assistant message and completes on chat-idle", async () => {
    const provider = useProvider({
      events: scriptedEvents([{ events: [textDelta("Hel"), textDelta("lo"), chatIdle()] }]),
    });

    await sendMessage("c1", "hi");

    expect(state().byChat.c1).toMatchObject([
      { role: "user", text: "hi", status: "complete" },
      { role: "assistant", text: "Hello", status: "complete" },
    ]);
    expect(provider.send).toHaveBeenCalledWith("c1", expect.objectContaining({ text: "hi" }));
    expect(state().activeTurns.c1).toBe(false);
  });

  it("keeps the user message and fails the turn when delivery fails", async () => {
    useProvider({
      send: jest.fn().mockRejectedValue(new Error("boom")),
      events: scriptedEvents([{ events: [], drop: true }]),
    });

    await sendMessage("c2", "hi");

    expect(state().byChat.c2).toMatchObject([
      { role: "user", text: "hi" },
      { role: "assistant", status: "error" },
    ]);
    expect(state().turnErrors.c2).toBe("boom");
  });

  it("ends on a terminal server error without reconciling", async () => {
    const provider = useProvider({
      events: scriptedEvents([
        { events: [{ type: "error", message: "bad key", retryable: false }], drop: true },
      ]),
    });

    await sendMessage("c3", "hi");

    expect(state().byChat.c3[1]).toMatchObject({ status: "error" });
    expect(state().turnErrors.c3).toBe("bad key");
    expect(provider.fetchMessages).not.toHaveBeenCalled();
  });

  it("explains a run that went idle without producing a reply", async () => {
    useProvider({ events: scriptedEvents([{ events: [chatIdle()], drop: true }]) });

    await sendMessage("c4", "hi");

    expect(state().turnErrors.c4).toContain("without returning a reply");
    expect(state().activeTurns.c4).toBe(false);
  });
});

describe("interruptTurn", () => {
  it("keeps the partial reply and settles even if the stream ignores abort", async () => {
    const provider = useProvider({
      events: jest.fn(() =>
        (async function* () {
          yield textDelta("Hel");
          yield textDelta("lo");
          await new Promise<void>(() => undefined);
        })(),
      ),
    });

    const done = sendMessage("c5", "hi");
    await flush();
    await interruptTurn("c5");
    await done;

    expect(state().byChat.c5[1]).toMatchObject({ text: "Hello", status: "interrupted" });
    expect(provider.interrupt).toHaveBeenCalledWith("c5");
    expect(state().activeTurns.c5).toBe(false);
  });

  it("removes the empty placeholder when nothing streamed yet", async () => {
    useProvider({ events: scriptedEvents([{ events: [] }]) });

    const done = sendMessage("c6", "hi");
    await flush();
    await interruptTurn("c6");
    await done;

    expect(state().byChat.c6).toMatchObject([{ role: "user", text: "hi" }]);
  });
});

describe("mid-turn reconnection", () => {
  it("reconciles from the server and continues under the server's ids", async () => {
    useProvider({
      events: scriptedEvents([
        { events: [textDelta("Hel")], drop: true },
        { events: [textDelta("!"), chatIdle()] },
      ]),
      fetchMessages: jest
        .fn()
        .mockResolvedValue([
          { id: "u1", role: "user", text: "hi", status: "complete", createdAt: 1 },
          assistant({ text: "Hello" }),
        ]),
    });

    await sendMessage("c7", "hi");

    expect(state().byChat.c7.map((m) => m.id)).toEqual(["u1", "a1"]);
    expect(state().byChat.c7[1]).toMatchObject({ text: "Hello!", status: "complete" });
  });

  it("ends a turn whose closing events were lost, once snapshots agree", async () => {
    useProvider({
      events: scriptedEvents([
        { events: [textDelta("Hel")], drop: true },
        { events: [], drop: true },
      ]),
      fetchMessages: jest
        .fn()
        .mockResolvedValue([assistant({ text: "Hello", status: "complete" })]),
    });

    await sendMessage("c8", "hi");

    expect(state().byChat.c8[0]).toMatchObject({ text: "Hello", status: "complete" });
    expect(state().activeTurns.c8).toBe(false);
  });
});

it("settles cached streaming messages when no turn is live", () => {
  state().setMessages("c10", [assistant({ text: "partial", status: "streaming" })]);
  settleOrphanedStreams("c10");
  expect(state().byChat.c10[0].status).toBe("interrupted");
});

describe("regenerateReply", () => {
  const serverTurn = (): Message[] => [
    { id: "msg_u1", role: "user", text: "older", status: "complete", createdAt: 1 },
    { id: "msg_a1", role: "assistant", text: "old reply", status: "complete", createdAt: 2 },
    { id: "msg_u2", role: "user", text: "again", status: "complete", createdAt: 3 },
    { id: "msg_a2", role: "assistant", text: "first reply", status: "complete", createdAt: 4 },
  ];

  it("prepares the rollback before subscribing, then replaces the turn", async () => {
    const order: string[] = [];
    let markerDuringDelivery: string | undefined;
    const events = scriptedEvents([{ events: [textDelta("second reply"), chatIdle()] }]);
    useProvider({
      capabilities: { regenerate: true } as ChatProvider["capabilities"],
      prepareRegenerate: jest.fn(async () => {
        order.push("prepare");
      }),
      regenerate: jest.fn(async () => {
        order.push("deliver");
        markerDuringDelivery = useChatsStore.getState().pendingRegenerate.c20;
      }),
      fetchMessages: jest.fn().mockResolvedValue(serverTurn()),
      events: (chatId, signal) => {
        order.push("subscribe");
        return events(chatId, signal);
      },
    });
    state().setMessages("c20", serverTurn());

    await expect(regenerateReply("c20")).resolves.toEqual({ ok: true });

    // Subscribing first would let the rollback's own events end the rerun.
    expect(order).toEqual(["prepare", "subscribe", "deliver"]);
    // Armed while undelivered, so a crash leaves a marker to clean up.
    expect(markerDuringDelivery).toBe("msg_u2");
    expect(useChatsStore.getState().pendingRegenerate.c20).toBeUndefined();
    expect(state().byChat.c20.map((m) => m.text)).toEqual([
      "older",
      "old reply",
      "again",
      "second reply",
    ]);
  });

  it("abandons the rollback and starts no turn when preparation fails", async () => {
    const provider = useProvider({
      capabilities: { regenerate: true } as ChatProvider["capabilities"],
      prepareRegenerate: jest.fn().mockRejectedValue(new Error("Session is busy")),
      regenerate: jest.fn(),
      discardRegenerate: jest.fn().mockResolvedValue(undefined),
      fetchMessages: jest.fn().mockResolvedValue(serverTurn()),
      events: jest.fn(),
    });
    state().setMessages("c21", serverTurn());

    await regenerateReply("c21");

    expect(provider.discardRegenerate).toHaveBeenCalledWith("c21");
    expect(provider.events).not.toHaveBeenCalled();
    expect(state().turnErrors.c21).toBe("Session is busy");
    expect(state().byChat.c21).toHaveLength(4);
  });

  it("re-sends app-side when the backend cannot rerun natively", async () => {
    const provider = useProvider({
      fetchMessages: jest.fn().mockResolvedValue(serverTurn()),
      events: scriptedEvents([{ events: [chatIdle()] }]),
    });
    state().setMessages("c22", serverTurn());

    await regenerateReply("c22");

    expect(provider.send).toHaveBeenCalledWith("c22", expect.objectContaining({ text: "again" }));
    expect(state().byChat.c22.some((m) => m.text === "first reply")).toBe(true);
  });

  it("refuses when an attachment lost its payload", async () => {
    const provider = useProvider({
      capabilities: { regenerate: true } as ChatProvider["capabilities"],
      regenerate: jest.fn(),
      fetchMessages: jest.fn().mockResolvedValue([
        {
          ...serverTurn()[2],
          attachments: [{ uri: "", mimeType: "image/png", name: "photo.png", size: 3 }],
        },
        serverTurn()[3],
      ]),
    });

    await expect(regenerateReply("c23")).resolves.toMatchObject({ ok: false });
    expect(provider.regenerate).not.toHaveBeenCalled();
  });
});

it("clears a staged-rerun marker even when the backend is unreachable", async () => {
  useProvider({ discardRegenerate: jest.fn().mockRejectedValue(new Error("offline")) });
  useChatsStore.getState().markPendingRegenerate("c30", "msg_9");

  await discardPendingRegenerate("c30");

  expect(useChatsStore.getState().pendingRegenerate.c30).toBeUndefined();
});
