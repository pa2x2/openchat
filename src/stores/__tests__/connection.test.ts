import { createConnectionStore, createMemoryStorage } from "@/src/stores";

describe("connection store", () => {
  it("persists the profile through saveProfile and rehydrates it", async () => {
    const storage = createMemoryStorage();
    const first = createConnectionStore(storage);
    first.getState().saveProfile({
      providerId: "opencode",
      baseUrl: "http://127.0.0.1:4097",
      serverVersion: "2.0.8",
    });
    expect(first.getState().state).toBe("connected");
    expect(first.getState().profile).toMatchObject({
      providerId: "opencode",
      baseUrl: "http://127.0.0.1:4097",
      serverVersion: "2.0.8",
    });

    // A fresh store (e.g. next app launch) rehydrates from the same storage.
    const second = createConnectionStore(storage);
    await new Promise((resolve) => setTimeout(resolve, 0)); // allow rehydration
    expect(second.getState().profile?.baseUrl).toBe("http://127.0.0.1:4097");
    expect(second.getState().profile?.serverVersion).toBe("2.0.8");
    // Runtime state is not persisted — a restarted app is not "connected".
    expect(second.getState().state).toBe("disconnected");
  });
});
