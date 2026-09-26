/**
 * Tests for the chats store (factory-built with in-memory storage).
 */

import { getProvider } from "@/src/lib/providerFactory";
import type { ChatProvider } from "@/src/providers/types";
import { createChatsStore, createMemoryStorage } from "@/src/stores";

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
    listChats: jest.fn().mockResolvedValue([]),
    createChat: jest.fn(),
    deleteChat: jest.fn(),
    setChatModel: jest.fn(),
    send: jest.fn(),
    interrupt: jest.fn(),
    events: jest.fn(),
    fetchMessages: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  getProviderMock.mockReset();
});

describe("chats store", () => {
  it("upserts and keeps the list newest-first", () => {
    const store = createChatsStore(createMemoryStorage());
    store.getState().upsert({ id: "a", title: "Old", updatedAt: 1 });
    store.getState().upsert({ id: "b", title: "New", updatedAt: 2 });
    expect(store.getState().chats.map((chat) => chat.id)).toEqual(["b", "a"]);

    store.getState().upsert({ id: "a", title: "Old (renamed)", updatedAt: 3 });
    expect(store.getState().chats.map((chat) => chat.id)).toEqual(["a", "b"]);
    expect(store.getState().chats[0].title).toBe("Old (renamed)");
  });

  it("touch bumps the timestamp and moves the chat to the top", () => {
    const store = createChatsStore(createMemoryStorage());
    store.getState().upsert({ id: "a", title: "A", updatedAt: 1 });
    store.getState().upsert({ id: "b", title: "B", updatedAt: 2 });

    store.getState().touch("a", 10);

    expect(store.getState().chats.map((chat) => chat.id)).toEqual(["a", "b"]);
    expect(store.getState().chats[0].updatedAt).toBe(10);
  });

  it("refresh adopts the server list", async () => {
    const provider = makeProvider({
      listChats: jest.fn().mockResolvedValue([{ id: "x", title: "From server", updatedAt: 5 }]),
    });
    getProviderMock.mockResolvedValue(provider);
    const store = createChatsStore(createMemoryStorage());

    await store.getState().refresh();

    expect(store.getState().error).toBeNull();
    expect(store.getState().chats).toEqual([{ id: "x", title: "From server", updatedAt: 5 }]);
  });

  it("refresh records failures without wiping the cached list", async () => {
    const provider = makeProvider({
      listChats: jest.fn().mockRejectedValue(new Error("no route to host")),
    });
    getProviderMock.mockResolvedValue(provider);
    const store = createChatsStore(createMemoryStorage());
    store.getState().upsert({ id: "a", title: "Cached", updatedAt: 1 });

    await store.getState().refresh();

    expect(store.getState().error).toBe("no route to host");
    expect(store.getState().chats).toEqual([{ id: "a", title: "Cached", updatedAt: 1 }]);
  });

  it("refresh without a provider reports not connected", async () => {
    getProviderMock.mockResolvedValue(null);
    const store = createChatsStore(createMemoryStorage());

    await store.getState().refresh();

    expect(store.getState().error).toBe("Not connected.");
  });

  it("persists chats and rehydrates them into a fresh store", async () => {
    const storage = createMemoryStorage();
    const first = createChatsStore(storage);
    first.getState().upsert({ id: "a", title: "Cached chat", updatedAt: 7 });

    const second = createChatsStore(storage);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(second.getState().chats).toEqual([{ id: "a", title: "Cached chat", updatedAt: 7 }]);
    // Loading state is live-only and not persisted.
    expect(second.getState().loading).toBe(false);
  });

  it("persists a staged-rerun marker so a crash cannot leave a rollback armed", async () => {
    const storage = createMemoryStorage();
    const first = createChatsStore(storage);
    first.getState().markPendingRegenerate("a", "msg_42");

    const second = createChatsStore(storage);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(second.getState().pendingRegenerate).toEqual({ a: "msg_42" });

    second.getState().clearPendingRegenerate("a");
    expect(second.getState().pendingRegenerate).toEqual({});
  });
});
