/**
 * Tests for the settings store (factory-built with in-memory storage).
 */

import { createMemoryStorage, createSettingsStore } from "@/src/stores";

describe("settings store", () => {
  it("stores and replaces the default model per provider", () => {
    const store = createSettingsStore(createMemoryStorage());
    store.getState().setDefaultModel("opencode", { provider: "opencode", id: "big-pickle" });
    expect(store.getState().defaultModels.opencode).toEqual({
      provider: "opencode",
      id: "big-pickle",
    });

    store.getState().setDefaultModel("opencode", { provider: "opencode-go", id: "glm-5.3" });
    expect(store.getState().defaultModels.opencode).toEqual({
      provider: "opencode-go",
      id: "glm-5.3",
    });
  });

  it("clears the default model", () => {
    const store = createSettingsStore(createMemoryStorage());
    store.getState().setDefaultModel("opencode", { provider: "opencode", id: "big-pickle" });
    store.getState().clearDefaultModel("opencode");
    expect(store.getState().defaultModels.opencode).toBeUndefined();
  });

  it("persists defaults and rehydrates them into a fresh store", async () => {
    const storage = createMemoryStorage();
    const first = createSettingsStore(storage);
    first.getState().setDefaultModel("opencode", { provider: "opencode", id: "big-pickle" });

    const second = createSettingsStore(storage);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(second.getState().defaultModels.opencode).toEqual({
      provider: "opencode",
      id: "big-pickle",
    });
  });
});
