/**
 * Update discovery against the app's GitHub Releases.
 *
 * App releases are the published `v*` releases with APK assets; the same
 * repository also publishes `server-opencode-*` image releases, which are
 * skipped. Drafts never appear here: the API hides them from anonymous calls.
 */

import type { UpdateChannel } from "@/src/stores/settings";
import { compareVersions, isPrerelease, parseVersion, type Version } from "./version";

export const RELEASES_REPO = "pa2x2/openchat";

const RELEASES_URL = `https://api.github.com/repos/${RELEASES_REPO}/releases?per_page=30`;

export interface AppRelease {
  /** Version without the tag's `v`, e.g. `1.1.0` or `1.1.0-alpha02`. */
  version: string;
  prerelease: boolean;
  /** Release notes as Markdown; may be empty. */
  notes: string;
  pageUrl: string;
  apk: {
    name: string;
    url: string;
    size: number;
    /** Lowercase hex SHA-256 from GitHub's asset digest, when it has one. */
    sha256: string | null;
  };
}

/** The slice of GitHub's release JSON this module reads. */
export interface GitHubRelease {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  body?: string | null;
  html_url: string;
  assets: {
    name: string;
    browser_download_url: string;
    size: number;
    digest?: string | null;
  }[];
}

/**
 * The APK to install: the build for the device's preferred ABI, else the
 * universal one. Names follow the release workflow:
 * `openchat-<abi>-<tag>.apk` and `openchat-<tag>.apk`.
 */
function pickApk(release: GitHubRelease, abis: readonly string[]): AppRelease["apk"] | null {
  const tag = release.tag_name;
  const names = [...abis.map((abi) => `openchat-${abi}-${tag}.apk`), `openchat-${tag}.apk`];
  for (const name of names) {
    const asset = release.assets.find((candidate) => candidate.name === name);
    if (asset) {
      const digest = asset.digest?.match(/^sha256:([0-9a-f]{64})$/i);
      return {
        name: asset.name,
        url: asset.browser_download_url,
        size: asset.size,
        sha256: digest ? digest[1].toLowerCase() : null,
      };
    }
  }
  return null;
}

/**
 * Drops GitHub alert blocks (`> [!TIP]` and friends): they are download
 * instructions for the releases page and do not render in the app.
 */
export function cleanNotes(body: string): string {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  let inAlert = false;
  for (const line of lines) {
    if (/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i.test(line)) {
      inAlert = true;
      continue;
    }
    if (inAlert && line.startsWith(">")) continue;
    inAlert = false;
    kept.push(line);
  }
  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The newest release on `channel` that is newer than `currentVersion`, or
 * null when the app is up to date. The stable channel skips anything that
 * is flagged as a pre-release or carries a pre-release version.
 */
export function selectUpdate(
  releases: readonly GitHubRelease[],
  channel: UpdateChannel,
  currentVersion: string,
  abis: readonly string[],
): AppRelease | null {
  const installed = parseVersion(currentVersion);
  if (!installed) return null;

  let best: { release: AppRelease; order: Version } | null = null;
  for (const release of releases) {
    if (release.draft || !release.tag_name.startsWith("v")) continue;
    const version = parseVersion(release.tag_name);
    if (!version) continue;
    const prerelease = release.prerelease || isPrerelease(release.tag_name);
    if (prerelease && channel === "stable") continue;
    if (compareVersions(version, installed) <= 0) continue;
    if (best && compareVersions(version, best.order) <= 0) continue;
    const apk = pickApk(release, abis);
    if (!apk) continue;
    best = {
      order: version,
      release: {
        version: release.tag_name.slice(1),
        prerelease,
        notes: cleanNotes(release.body ?? ""),
        pageUrl: release.html_url,
        apk,
      },
    };
  }
  return best?.release ?? null;
}

export async function fetchReleases(
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<GitHubRelease[]> {
  let response: Response;
  try {
    response = await fetchImpl(RELEASES_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("Couldn't reach GitHub. Check your internet connection.");
  }
  if (
    (response.status === 403 || response.status === 429) &&
    response.headers.get("x-ratelimit-remaining") === "0"
  ) {
    throw new Error("GitHub is limiting update checks from this network. Try again later.");
  }
  if (!response.ok) {
    throw new Error(`GitHub answered the update check with HTTP ${response.status}.`);
  }
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error("GitHub sent an unexpected release list.");
  return data as GitHubRelease[];
}
