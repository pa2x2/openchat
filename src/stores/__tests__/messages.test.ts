import { getProvider } from "@/src/lib/providerFactory";
import { createMemoryStorage, createMessagesStore } from "@/src/stores";
import type { Message } from "@/src/domain";

jest.mock("@/src/lib/providerFactory", () => ({
  getProvider: jest.fn(),
}));

const msg = (patch: Partial<Message>): Message => ({
  id: "m1",
  role: "user",
  text: "hello",
  status: "complete",
  createdAt: 1,
  ...patch,
});

const rehydrated = async <T>(create: () => T): Promise<T> => {
  const store = create();
  await new Promise((resolve) => setTimeout(resolve, 0));
  return store;
};

describe("messages store", () => {
  it("sorts by createdAt and dedupes", () => {
    const store = createMessagesStore(createMemoryStorage(), 0);
    store.getState().setMessages("c1", [msg({ id: "m2", createdAt: 2 }), msg({}), msg({})]);
    store.getState().appendMessage("c1", msg({}));
    expect(store.getState().byChat.c1.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("keeps the cached transcript when the fetch fails", async () => {
    jest.mocked(getProvider).mockResolvedValue({
      fetchMessages: jest.fn().mockRejectedValue(new Error("offline")),
    } as never);
    const store = createMessagesStore(createMemoryStorage(), 0);
    store.getState().appendMessage("c1", msg({ id: "local1" }));

    await store.getState().fetchMessages("c1");

    expect(store.getState().byChat.c1.map((m) => m.id)).toEqual(["local1"]);
    expect(store.getState().loading.c1).toBe(false);
  });

  it("persists transcripts without attachment bytes or runtime turn state", async () => {
    const storage = createMemoryStorage();
    const first = createMessagesStore(storage, 0);
    const photo = { uri: "", mimeType: "image/png", name: "photo.png", bytes: "QUJD", size: 3 };
    first.getState().appendMessage("c1", msg({ attachments: [photo] }));
    first.getState().setTurnActive("c1", true);
    first.getState().setTurnError("c1", "boom");

    const second = await rehydrated(() => createMessagesStore(storage));

    expect(second.getState().byChat.c1[0].attachments).toEqual([
      { uri: "", mimeType: "image/png", name: "photo.png", size: 3 },
    ]);
    expect(second.getState().activeTurns.c1).toBeUndefined();
    expect(second.getState().turnErrors.c1).toBeUndefined();
    // The live transcript still has the payload for rendering.
    expect(first.getState().byChat.c1[0].attachments?.[0].bytes).toBe("QUJD");
  });

  it("coalesces a burst of streaming patches into one write", () => {
    jest.useFakeTimers();
    try {
      const storage = createMemoryStorage();
      const setItem = jest.spyOn(storage, "setItem");
      const store = createMessagesStore(storage, 1_000);
      store.getState().appendMessage("c1", msg({ id: "a1", role: "assistant", text: "" }));
      for (const text of ["He", "Hello", "Hello, world"]) {
        store.getState().patchMessage("c1", "a1", { text, status: "streaming" });
      }
      expect(setItem).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1_000);

      expect(setItem).toHaveBeenCalledTimes(1);
      const persisted = JSON.parse(storage.getItem("messages") as string);
      expect(persisted.state.byChat.c1[0].text).toBe("Hello, world");
    } finally {
      jest.useRealTimers();
    }
  });
});
