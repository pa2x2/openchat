import { getProvider } from "@/src/lib/providerFactory";
import { createChatsStore, createMemoryStorage } from "@/src/stores";

jest.mock("@/src/lib/providerFactory", () => ({
  getProvider: jest.fn(),
}));

describe("chats store", () => {
  it("keeps the list newest-first as chats change", () => {
    const store = createChatsStore(createMemoryStorage());
    store.getState().upsert({ id: "a", title: "A", updatedAt: 1 });
    store.getState().upsert({ id: "b", title: "B", updatedAt: 2 });
    store.getState().upsert({ id: "c", title: "C", updatedAt: 3 });
    expect(store.getState().chats.map((chat) => chat.id)).toEqual(["c", "b", "a"]);

    store.getState().upsert({ id: "a", title: "A (renamed)", updatedAt: 4 });
    store.getState().touch("b", 5);
    expect(store.getState().chats.map((chat) => chat.id)).toEqual(["b", "a", "c"]);
  });

  it("keeps the cached list when a refresh fails", async () => {
    jest.mocked(getProvider).mockResolvedValue({
      listChats: jest.fn().mockRejectedValue(new Error("no route to host")),
    } as never);
    const store = createChatsStore(createMemoryStorage());
    store.getState().upsert({ id: "a", title: "Cached", updatedAt: 1 });

    await store.getState().refresh();

    expect(store.getState().error).toBe("no route to host");
    expect(store.getState().chats).toEqual([{ id: "a", title: "Cached", updatedAt: 1 }]);
  });

  it("persists a staged-rerun marker so a crash cannot leave a rollback armed", async () => {
    const storage = createMemoryStorage();
    createChatsStore(storage).getState().markPendingRegenerate("a", "msg_42");

    const restarted = createChatsStore(storage);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(restarted.getState().pendingRegenerate).toEqual({ a: "msg_42" });
  });
});
