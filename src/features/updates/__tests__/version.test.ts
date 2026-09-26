import { compareVersions, parseVersion } from "../version";

function order(a: string, b: string): number {
  return Math.sign(compareVersions(parseVersion(a)!, parseVersion(b)!));
}

describe("parseVersion", () => {
  it("rejects anything that is not X.Y.Z[-pre]", () => {
    expect(parseVersion("server-opencode-2.0.16-alpha01")).toBeNull();
    expect(parseVersion("1.2")).toBeNull();
    expect(parseVersion("")).toBeNull();
  });
});

describe("compareVersions", () => {
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
