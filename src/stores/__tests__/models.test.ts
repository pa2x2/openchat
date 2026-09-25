/**
 * Tests for the models store (factory-built with in-memory storage).
 */

import { getProvider } from "@/src/lib/providerFactory";
import type { ChatProvider } from "@/src/providers/types";
import { createModelsStore, createMemoryStorage, sameModelRef } from "@/src/stores";

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
    listModels: jest.fn().mockResolvedValue([]),
    listChats: jest.fn(),
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

describe("sameModelRef", () => {
  it("compares provider and id", () => {
    expect(sameModelRef({ provider: "p", id: "m" }, { provider: "p", id: "m" })).toBe(true);
    expect(sameModelRef({ provider: "p", id: "m" }, { provider: "p", id: "other" })).toBe(false);
    expect(sameModelRef({ provider: "p", id: "m" }, { provider: "other", id: "m" })).toBe(false);
  });
});

describe("models store", () => {
  it("refresh adopts the server list", async () => {
    const catalog = [{ ref: { provider: "opencode", id: "big-pickle" }, label: "Big Pickle" }];
    const provider = makeProvider({ listModels: jest.fn().mockResolvedValue(catalog) });
    getProviderMock.mockResolvedValue(provider);
    const store = createModelsStore(createMemoryStorage());

    await store.getState().refresh();

    expect(store.getState().error).toBeNull();
    expect(store.getState().models).toEqual(catalog);
  });

  it("refresh records failures without wiping the cached list", async () => {
    const provider = makeProvider({
      listModels: jest.fn().mockRejectedValue(new Error("offline")),
    });
    getProviderMock.mockResolvedValue(provider);
    const store = createModelsStore(createMemoryStorage());
    store.setState({
      models: [{ ref: { provider: "p", id: "m" }, label: "Cached" }],
    });

    await store.getState().refresh();

    expect(store.getState().error).toBe("offline");
    expect(store.getState().models).toHaveLength(1);
  });

  it("refresh without a provider reports not connected", async () => {
    getProviderMock.mockResolvedValue(null);
    const store = createModelsStore(createMemoryStorage());

    await store.getState().refresh();

    expect(store.getState().error).toBe("Not connected.");
  });

  it("persists the catalog and rehydrates it into a fresh store", async () => {
    const storage = createMemoryStorage();
    const first = createModelsStore(storage);
    first.setState({
      models: [{ ref: { provider: "p", id: "m" }, label: "Cached" }],
    });

    const second = createModelsStore(storage);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(second.getState().models).toEqual([
      { ref: { provider: "p", id: "m" }, label: "Cached" },
    ]);
    expect(second.getState().loading).toBe(false);
  });
});
