/**
 * Tests for the settings store (factory-built with in-memory storage).
 */

import { createMemoryStorage, createSettingsStore } from "@/src/stores";
import { defaultUpdateChannel } from "@/src/stores/settings";

describe("settings store", () => {
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

describe("update channel", () => {
  it("starts pre-release builds on the pre-release channel", () => {
    expect(defaultUpdateChannel("1.0.0-alpha01")).toBe("prerelease");
    expect(defaultUpdateChannel("1.0.0")).toBe("stable");
    expect(
      createSettingsStore(createMemoryStorage(), "1.0.0-alpha01").getState().updateChannel,
    ).toBe("prerelease");
  });
});
