/**
 * Tests for picking the update to offer from GitHub's release list.
 */

import { cleanNotes, fetchReleases, selectUpdate, type GitHubRelease } from "../releases";

const DIGEST = "a".repeat(64);

function release(
  tag: string,
  options: { prerelease?: boolean; draft?: boolean; abis?: string[]; body?: string } = {},
): GitHubRelease {
  const abis = options.abis ?? ["arm64-v8a", "x86_64"];
  const names = [`openchat-${tag}.apk`, ...abis.map((abi) => `openchat-${abi}-${tag}.apk`)];
  return {
    tag_name: tag,
    draft: options.draft ?? false,
    prerelease: options.prerelease ?? false,
    body: options.body ?? `Release ${tag}`,
    html_url: `https://github.com/pa2x2/openchat/releases/tag/${tag}`,
    assets: names.map((name) => ({
      name,
      browser_download_url: `https://github.com/pa2x2/openchat/releases/download/${tag}/${name}`,
      size: 1000,
      digest: `sha256:${DIGEST}`,
    })),
  };
}

const server: GitHubRelease = {
  tag_name: "server-opencode-2.0.16-alpha01",
  draft: false,
  prerelease: true,
  html_url: "https://github.com/pa2x2/openchat/releases/tag/server-opencode-2.0.16-alpha01",
  assets: [],
};

describe("selectUpdate", () => {
  const list = [
    release("v1.2.0-beta1", { prerelease: true }),
    server,
    release("v1.1.0"),
    release("v1.0.0"),
  ];

  it("offers the newest release on the pre-release channel", () => {
    const update = selectUpdate(list, "prerelease", "1.0.0", ["arm64-v8a"]);
    expect(update?.version).toBe("1.2.0-beta1");
    expect(update?.prerelease).toBe(true);
  });

  it("keeps the stable channel on stable releases", () => {
    expect(selectUpdate(list, "stable", "1.0.0", ["arm64-v8a"])?.version).toBe("1.1.0");
  });

  it("treats a pre-release version as a pre-release even when GitHub doesn't flag it", () => {
    const unflagged = [release("v1.2.0-rc1"), release("v1.0.0")];
    expect(selectUpdate(unflagged, "stable", "1.0.0", [])).toBeNull();
  });

  it("returns null when nothing is newer", () => {
    expect(selectUpdate(list, "prerelease", "1.2.0-beta1", [])).toBeNull();
    expect(selectUpdate(list, "stable", "1.1.0", [])).toBeNull();
  });

  it("never offers a stable downgrade to someone on a newer pre-release", () => {
    expect(selectUpdate(list, "stable", "1.2.0-beta1", [])).toBeNull();
  });

  it("does not depend on the order GitHub lists releases in", () => {
    const shuffled = [release("v1.0.1"), release("v1.3.0"), release("v1.2.0")];
    expect(selectUpdate(shuffled, "stable", "1.0.0", [])?.version).toBe("1.3.0");
  });

  it("skips drafts, non-app tags and releases without an APK", () => {
    const skipped = [
      release("v2.0.0", { draft: true }),
      { ...release("v1.9.0"), assets: [] },
      server,
      release("v1.1.0"),
    ];
    expect(selectUpdate(skipped, "prerelease", "1.0.0", [])?.version).toBe("1.1.0");
  });

  it("prefers the APK for the device's ABI and falls back to the universal one", () => {
    const perAbi = selectUpdate(list, "stable", "1.0.0", ["x86", "x86_64"]);
    expect(perAbi?.apk.name).toBe("openchat-x86_64-v1.1.0.apk");
    expect(perAbi?.apk.sha256).toBe(DIGEST);

    const universal = selectUpdate(list, "stable", "1.0.0", ["riscv64"]);
    expect(universal?.apk.name).toBe("openchat-v1.1.0.apk");
  });

  it("leaves the checksum empty when GitHub has no digest", () => {
    const bare = release("v1.1.0");
    bare.assets = bare.assets.map((asset) => ({ ...asset, digest: null }));
    expect(selectUpdate([bare], "stable", "1.0.0", [])?.apk.sha256).toBeNull();
  });

  it("offers nothing when the installed version is unknown", () => {
    expect(selectUpdate(list, "prerelease", "", [])).toBeNull();
  });
});

describe("cleanNotes", () => {
  it("drops GitHub alert blocks and keeps the rest", () => {
    const body = [
      "### ✨ Added",
      "",
      "- In-app updates.",
      "",
      "> [!TIP]",
      ">",
      "> If you are unsure which version to download, use `openchat-v1.1.0.apk`.",
      "",
      "> A plain quote stays.",
    ].join("\r\n");
    expect(cleanNotes(body)).toBe("### ✨ Added\n\n- In-app updates.\n\n> A plain quote stays.");
  });
});

describe("fetchReleases", () => {
  function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
    return jest.fn(
      async () => new Response(JSON.stringify(body), { status, headers }) as unknown as Response,
    ) as unknown as typeof fetch;
  }

  it("returns the release list", async () => {
    await expect(fetchReleases(respond(200, [release("v1.0.0")]))).resolves.toHaveLength(1);
  });

  it("explains GitHub's rate limit", async () => {
    const limited = respond(403, { message: "rate limited" }, { "x-ratelimit-remaining": "0" });
    await expect(fetchReleases(limited)).rejects.toThrow(/limiting update checks/);
  });

  it("reports other HTTP failures and network errors", async () => {
    await expect(fetchReleases(respond(500, {}))).rejects.toThrow(/HTTP 500/);
    const offline = jest.fn(async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;
    await expect(fetchReleases(offline)).rejects.toThrow(/Couldn't reach GitHub/);
  });
});
