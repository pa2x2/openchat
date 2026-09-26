/**
 * Semantic versions as the release workflow tags them: `X.Y.Z` or
 * `X.Y.Z-prerelease`, optionally with a leading `v`.
 */

export interface Version {
  major: number;
  minor: number;
  patch: number;
  /** Dot-separated pre-release identifiers; empty for a stable release. */
  prerelease: string[];
}

const PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseVersion(input: string): Version | null {
  const match = PATTERN.exec(input.trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

export function isPrerelease(input: string): boolean {
  return (parseVersion(input)?.prerelease.length ?? 0) > 0;
}

function compareIdentifiers(a: string, b: string): number {
  const aNumeric = /^\d+$/.test(a);
  const bNumeric = /^\d+$/.test(b);
  if (aNumeric && bNumeric) return Number(a) - Number(b);
  // Numeric identifiers sort before alphanumeric ones.
  if (aNumeric) return -1;
  if (bNumeric) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** SemVer 2.0.0 precedence: negative when `a` is older than `b`. */
export function compareVersions(a: Version, b: Version): number {
  const core = a.major - b.major || a.minor - b.minor || a.patch - b.patch;
  if (core !== 0) return core;
  // A release outranks any pre-release of the same core version.
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    return b.prerelease.length - a.prerelease.length;
  }
  const length = Math.min(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index++) {
    const order = compareIdentifiers(a.prerelease[index], b.prerelease[index]);
    if (order !== 0) return order;
  }
  return a.prerelease.length - b.prerelease.length;
}
