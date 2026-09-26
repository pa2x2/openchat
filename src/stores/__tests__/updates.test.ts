import type { GitHubRelease } from "@/src/features/updates/releases";
import { createMemoryStorage } from "@/src/stores/storage";
import { AUTO_CHECK_INTERVAL_MS, createUpdatesStore, type UpdaterDeps } from "@/src/stores/updates";

function release(tag: string, prerelease = false): GitHubRelease {
  const name = `openchat-${tag}.apk`;
  return {
    tag_name: tag,
    draft: false,
    prerelease,
    body: "- New things",
    html_url: `https://github.com/pa2x2/openchat/releases/tag/${tag}`,
    assets: [
      {
        name,
        browser_download_url: `https://example.test/${name}`,
        size: 100,
        digest: `sha256:${"b".repeat(64)}`,
      },
    ],
  };
}

function codedError(code: string, message = code) {
  return Object.assign(new Error(message), { code });
}

function setup(overrides: Partial<UpdaterDeps> = {}) {
  let now = 1_000_000;
  const deps = {
    supported: true,
    appVersion: "1.0.0",
    channel: jest.fn(() => "stable" as const),
    abis: () => [],
    fetchReleases: jest.fn(async () => [release("v1.1.0"), release("v1.2.0-beta1", true)]),
    download: jest.fn(async (_apk, onProgress: (fraction: number | null) => void) => {
      onProgress(0.5);
      return "file:///cache/updates/openchat-v1.1.0.apk";
    }),
    clearDownloads: jest.fn(),
    canInstall: jest.fn(() => true),
    openInstallSettings: jest.fn(),
    // A real successful install kills the app; here it just never settles.
    install: jest.fn(() => new Promise<void>(() => {})),
    now: () => now,
    ...overrides,
  } satisfies UpdaterDeps;
  const store = createUpdatesStore(createMemoryStorage(), deps);
  return { store, deps, advance: (ms: number) => (now += ms) };
}

describe("updates store: checking", () => {
  it("finds the newest release on the channel", async () => {
    const { store } = setup();
    await store.getState().check();
    expect(store.getState().status).toBe("available");
    expect(store.getState().release?.version).toBe("1.1.0");
    expect(store.getState().lastCheckedAt).toBe(1_000_000);
  });

  it("shows errors from manual checks only", async () => {
    const fetchReleases = jest.fn(async () => {
      throw new Error("offline");
    });
    const { store } = setup({ fetchReleases });
    await store.getState().check({ auto: true });
    expect(store.getState()).toMatchObject({ status: "idle", error: null });
    await store.getState().check();
    expect(store.getState()).toMatchObject({ status: "error", error: "offline" });
  });

  it("throttles automatic checks but not manual ones", async () => {
    const { store, deps, advance } = setup();
    await store.getState().check({ auto: true });
    await store.getState().check({ auto: true });
    expect(deps.fetchReleases).toHaveBeenCalledTimes(1);
    await store.getState().check();
    expect(deps.fetchReleases).toHaveBeenCalledTimes(2);
    advance(AUTO_CHECK_INTERVAL_MS);
    await store.getState().check({ auto: true });
    expect(deps.fetchReleases).toHaveBeenCalledTimes(3);
  });

  it("lets a newer check replace a running one", async () => {
    let resolveFirst: (value: GitHubRelease[]) => void = () => {};
    const fetchReleases = jest
      .fn()
      .mockImplementationOnce(
        (signal?: AbortSignal) =>
          new Promise<GitHubRelease[]>((resolve) => {
            resolveFirst = resolve;
            expect(signal).toBeDefined();
          }),
      )
      .mockImplementationOnce(async () => [release("v1.3.0")]);
    const { store } = setup({ fetchReleases });
    const first = store.getState().check();
    await store.getState().check();
    resolveFirst([release("v1.1.0")]);
    await first;
    expect(store.getState().release?.version).toBe("1.3.0");
  });
});

describe("updates store: prompt", () => {
  it("opens the prompt from an automatic check until the version is dismissed", async () => {
    const { store, advance } = setup();
    await store.getState().check({ auto: true });
    expect(store.getState().sheetOpen).toBe(true);

    store.getState().closeSheet();
    expect(store.getState()).toMatchObject({ sheetOpen: false, dismissedVersion: "1.1.0" });

    advance(AUTO_CHECK_INTERVAL_MS);
    await store.getState().check({ auto: true });
    expect(store.getState().sheetOpen).toBe(false);
  });
});

describe("updates store: installing", () => {
  it("downloads, then installs with the release checksum", async () => {
    const { store, deps } = setup();
    await store.getState().check();
    void store.getState().startUpdate();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(deps.download).toHaveBeenCalledWith(
      expect.objectContaining({ name: "openchat-v1.1.0.apk" }),
      expect.any(Function),
      expect.any(AbortSignal),
    );
    expect(deps.install).toHaveBeenCalledWith(
      "file:///cache/updates/openchat-v1.1.0.apk",
      "b".repeat(64),
    );
    expect(store.getState()).toMatchObject({ status: "installing", progress: 1 });
  });

  it("waits for the install permission, then continues", async () => {
    const canInstall = jest.fn(() => false);
    const { store, deps } = setup({ canInstall });
    await store.getState().check();
    await store.getState().startUpdate();
    expect(store.getState().status).toBe("needsPermission");
    expect(deps.install).not.toHaveBeenCalled();

    store.getState().requestInstallPermission();
    expect(deps.openInstallSettings).toHaveBeenCalled();

    await store.getState().resumeInstall();
    expect(store.getState().status).toBe("needsPermission");

    canInstall.mockReturnValue(true);
    void store.getState().resumeInstall();
    expect(store.getState().status).toBe("installing");
    expect(deps.install).toHaveBeenCalledTimes(1);
  });

  it("goes back to the offer when the user cancels Android's confirmation", async () => {
    const install = jest.fn(async () => {
      throw codedError("E_INSTALL_CANCELLED");
    });
    const { store } = setup({ install });
    await store.getState().check();
    await store.getState().startUpdate();
    expect(store.getState()).toMatchObject({ status: "available", error: null });
  });

  it("throws away a damaged download so a retry fetches it again", async () => {
    const install = jest.fn(async () => {
      throw codedError("E_CHECKSUM");
    });
    const clearDownloads = jest.fn();
    const { store } = setup({ install, clearDownloads });
    await store.getState().check();
    clearDownloads.mockClear();
    await store.getState().startUpdate();
    expect(store.getState().status).toBe("error");
    expect(store.getState().error).toMatch(/damaged/);
    expect(clearDownloads).toHaveBeenCalled();
  });

  it("cancels a download back to the offer", async () => {
    const download = jest.fn(
      (_apk: unknown, _onProgress: unknown, signal?: AbortSignal) =>
        new Promise<string>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("AbortError")));
        }),
    );
    const { store, deps } = setup({ download });
    await store.getState().check();
    const running = store.getState().startUpdate();
    expect(store.getState().status).toBe("downloading");
    store.getState().cancelDownload();
    await running;
    expect(store.getState()).toMatchObject({ status: "available", error: null });
    expect(deps.install).not.toHaveBeenCalled();
  });

  it("does not count closing the sheet mid-download as a dismissal", async () => {
    const download = jest.fn(() => new Promise<string>(() => {}));
    const { store } = setup({ download });
    await store.getState().check();
    store.getState().openSheet();
    void store.getState().startUpdate();
    store.getState().closeSheet();
    expect(store.getState()).toMatchObject({ sheetOpen: false, dismissedVersion: null });
  });
});
