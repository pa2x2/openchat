import { themes, lightTokens, darkTokens } from "../theme";

describe("theme", () => {
  it("provides a light and dark theme", () => {
    expect(Object.keys(themes).sort()).toEqual(["dark", "light"]);
  });

  it("defines the same semantic variables in both schemes", () => {
    const lightVars = Object.keys(lightTokens);
    const darkVars = Object.keys(darkTokens);
    expect(lightVars.length).toBeGreaterThan(0);
    expect(darkVars.sort()).toEqual([...lightVars].sort());
  });

  it("differs between schemes (dark mode actually changes values)", () => {
    expect(lightTokens).not.toEqual(darkTokens);
  });
});
