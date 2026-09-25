/**
 * Tests for the messages store (factory-built with in-memory storage).
 */

import { getProvider } from "@/src/lib/providerFactory";
import type { ChatProvider } from "@/src/providers/types";
import { createMemoryStorage, createMessagesStore } from "@/src/stores";
import type { Message } from "@/src/domain";

jest.mock("@/src/lib/providerFactory", () => ({
  getProvider: jest.fn(),
}));

const getProviderMock = getProvider as jest.Mock;

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
    listChats: jest.fn(),
    createChat: jest.fn(),
    deleteChat: jest.fn(),
    setChatModel: jest.fn(),
    send: jest.fn(),
    interrupt: jest.fn(),
    events: jest.fn(),
    fetchMessages: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

const msg = (patch: Partial<Message>): Message => ({
  id: "m1",
  role: "user",
  text: "hello",
  status: "complete",
  createdAt: 1,
  ...patch,
});

beforeEach(() => {
  getProviderMock.mockReset();
});

describe("messages store", () => {
  it("appendMessage adds messages without duplicates", () => {
    const store = createMessagesStore(createMemoryStorage());
    store.getState().appendMessage("c1", msg({ id: "m1" }));
    store.getState().appendMessage("c1", msg({ id: "m1" }));
    store.getState().appendMessage("c1", msg({ id: "m2", createdAt: 2 }));
    expect(store.getState().byChat.c1.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("setMessages sorts by createdAt and dedupes", () => {
    const store = createMessagesStore(createMemoryStorage());
    store
      .getState()
      .setMessages("c1", [
        msg({ id: "m2", createdAt: 2 }),
        msg({ id: "m1", createdAt: 1 }),
        msg({ id: "m1", createdAt: 1 }),
      ]);
    expect(store.getState().byChat.c1.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("patchMessage updates only the target message", () => {
    const store = createMessagesStore(createMemoryStorage());
    store.getState().appendMessage("c1", msg({ id: "m1" }));
    store.getState().appendMessage("c1", msg({ id: "m2", createdAt: 2 }));
    store.getState().patchMessage("c1", "m2", { status: "streaming", text: "partial" });
    expect(store.getState().byChat.c1.find((m) => m.id === "m2")).toMatchObject({
      status: "streaming",
      text: "partial",
    });
    expect(store.getState().byChat.c1.find((m) => m.id === "m1")?.text).toBe("hello");
  });

  it("removeMessage drops one message; removeChat drops the transcript", () => {
    const store = createMessagesStore(createMemoryStorage());
    store.getState().appendMessage("c1", msg({ id: "m1" }));
    store.getState().appendMessage("c1", msg({ id: "m2", createdAt: 2 }));
    store.getState().removeMessage("c1", "m1");
    expect(store.getState().byChat.c1.map((m) => m.id)).toEqual(["m2"]);
    store.getState().removeChat("c1");
    expect(store.getState().byChat.c1).toBeUndefined();
  });

  it("removeMessages drops a whole turn at once", () => {
    const store = createMessagesStore(createMemoryStorage());
    store.getState().appendMessage("c1", msg({ id: "keep", createdAt: 1 }));
    store.getState().appendMessage("c1", msg({ id: "u2", createdAt: 2 }));
    store.getState().appendMessage("c1", msg({ id: "a2", createdAt: 3, role: "assistant" }));

    store.getState().removeMessages("c1", ["u2", "a2"]);

    expect(store.getState().byChat.c1.map((m) => m.id)).toEqual(["keep"]);
  });

  it("setTurnActive/setTurnError track runtime state", () => {
    const store = createMessagesStore(createMemoryStorage());
    store.getState().setTurnActive("c1", true);
    store.getState().setTurnError("c1", "boom");
    expect(store.getState().activeTurns.c1).toBe(true);
    expect(store.getState().turnErrors.c1).toBe("boom");
    store.getState().setTurnError("c1", null);
    expect(store.getState().turnErrors.c1).toBeNull();
  });

  it("fetchMessages adopts the server transcript wholesale", async () => {
    const provider = makeProvider({
      fetchMessages: jest
        .fn()
        .mockResolvedValue([msg({ id: "srv1", text: "server truth", createdAt: 3 })]),
    });
    getProviderMock.mockResolvedValue(provider);
    const store = createMessagesStore(createMemoryStorage());
    store.getState().appendMessage("c1", msg({ id: "local1" }));

    await store.getState().fetchMessages("c1");

    expect(store.getState().byChat.c1).toEqual([
      msg({ id: "srv1", text: "server truth", createdAt: 3 }),
    ]);
    expect(store.getState().loading.c1).toBe(false);
  });

  it("fetchMessages keeps the cached transcript on failure", async () => {
    const provider = makeProvider({
      fetchMessages: jest.fn().mockRejectedValue(new Error("offline")),
    });
    getProviderMock.mockResolvedValue(provider);
    const store = createMessagesStore(createMemoryStorage());
    store.getState().appendMessage("c1", msg({ id: "local1" }));

    await store.getState().fetchMessages("c1");

    expect(store.getState().byChat.c1.map((m) => m.id)).toEqual(["local1"]);
    expect(store.getState().loading.c1).toBe(false);
  });

  it("fetchMessages without a provider leaves the cache untouched", async () => {
    getProviderMock.mockResolvedValue(null);
    const store = createMessagesStore(createMemoryStorage());
    store.getState().appendMessage("c1", msg({ id: "local1" }));

    await store.getState().fetchMessages("c1");

    expect(store.getState().byChat.c1.map((m) => m.id)).toEqual(["local1"]);
  });

  it("persists transcripts but not runtime turn state", async () => {
    const storage = createMemoryStorage();
    const first = createMessagesStore(storage);
    first.getState().appendMessage("c1", msg({ id: "m1" }));
    first.getState().setTurnActive("c1", true);
    first.getState().setTurnError("c1", "boom");

    const second = createMessagesStore(storage);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(second.getState().byChat.c1.map((m) => m.id)).toEqual(["m1"]);
    expect(second.getState().activeTurns.c1).toBeUndefined();
    expect(second.getState().turnErrors.c1).toBeUndefined();
  });

  it("keeps attachment bytes in memory but not in the persisted transcript", async () => {
    const storage = createMemoryStorage();
    const first = createMessagesStore(storage);
    first.getState().appendMessage(
      "c1",
      msg({
        id: "m1",
        attachments: [
          { uri: "", mimeType: "image/png", name: "photo.png", bytes: "QUJD", size: 3 },
        ],
      }),
    );

    const second = createMessagesStore(storage);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(second.getState().byChat.c1[0]?.attachments).toEqual([
      { uri: "", mimeType: "image/png", name: "photo.png", size: 3 },
    ]);
    // Still in memory for rendering: the live transcript keeps the payload.
    expect(first.getState().byChat.c1[0]?.attachments?.[0]?.bytes).toBe("QUJD");
    expect(JSON.stringify(storage.getItem("messages"))).not.toContain("QUJD");
  });
});
