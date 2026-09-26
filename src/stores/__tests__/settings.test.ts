import { createMemoryStorage, createSettingsStore } from "@/src/stores";

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
  it("picks the channel from the build's version", () => {
    const channelFor = (appVersion: string) =>
      createSettingsStore(createMemoryStorage(), appVersion).getState().updateChannel;

    expect(channelFor("1.0.0-alpha01")).toBe("prerelease");
    expect(channelFor("1.0.0")).toBe("stable");
  });
});
