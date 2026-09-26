import { compareVersions, isNewer, isPrerelease, parseVersion } from "../version";

function order(a: string, b: string): number {
  return Math.sign(compareVersions(parseVersion(a)!, parseVersion(b)!));
}

describe("parseVersion", () => {
  it("reads versions with and without the tag prefix", () => {
    expect(parseVersion("v1.2.3")).toEqual({ major: 1, minor: 2, patch: 3, prerelease: [] });
    expect(parseVersion("1.0.0-alpha01")).toEqual({
      major: 1,
      minor: 0,
      patch: 0,
      prerelease: ["alpha01"],
    });
  });

  it("rejects anything that is not X.Y.Z[-pre]", () => {
    expect(parseVersion("server-opencode-2.0.16-alpha01")).toBeNull();
    expect(parseVersion("1.2")).toBeNull();
    expect(parseVersion("")).toBeNull();
  });
});

describe("compareVersions", () => {
  it("orders by major, minor and patch numerically", () => {
    expect(order("1.10.0", "1.9.0")).toBe(1);
    expect(order("2.0.0", "1.99.99")).toBe(1);
    expect(order("1.0.1", "1.0.1")).toBe(0);
  });

  it("ranks a release above its pre-releases", () => {
    expect(order("1.0.0", "1.0.0-alpha01")).toBe(1);
    expect(order("1.0.0-rc.1", "1.0.0")).toBe(-1);
  });

  it("follows SemVer pre-release precedence", () => {
    const sorted = [
      "1.0.0-alpha",
      "1.0.0-alpha.1",
      "1.0.0-alpha.beta",
      "1.0.0-beta",
      "1.0.0-beta.2",
      "1.0.0-beta.11",
      "1.0.0-rc.1",
      "1.0.0",
    ];
    for (let index = 1; index < sorted.length; index++) {
      expect(order(sorted[index - 1], sorted[index])).toBe(-1);
    }
    expect(order("1.0.0-alpha01", "1.0.0-alpha02")).toBe(-1);
  });
});

describe("isNewer / isPrerelease", () => {
  it("compares tags against the installed version", () => {
    expect(isNewer("v1.0.0-alpha02", "1.0.0-alpha01")).toBe(true);
    expect(isNewer("v1.0.0-alpha01", "1.0.0-alpha01")).toBe(false);
    expect(isNewer("garbage", "1.0.0")).toBe(false);
  });

  it("spots pre-release versions", () => {
    expect(isPrerelease("1.0.0-alpha01")).toBe(true);
    expect(isPrerelease("1.0.0")).toBe(false);
    expect(isPrerelease("")).toBe(false);
  });
});
