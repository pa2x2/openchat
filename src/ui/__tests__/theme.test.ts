import {
  cssVarName,
  darkTokens,
  hexToTriplet,
  lightTokens,
  palette,
  paletteKeys,
  resolvePalette,
  themeForScheme,
  type PaletteKey,
} from "../theme";

/** Every colour the navigation theme may pass to a React Navigation option. */
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** WCAG contrast ratio between two hex colours. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = hexToTriplet(hex)
      .split(" ")
      .map((channel) => {
        const c = Number(channel) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("theme", () => {
  it("provides a light and dark theme", () => {
    expect(Object.keys(themeForScheme("light").colors).length).toBeGreaterThan(0);
    expect(themeForScheme("light").navigationTheme.dark).toBe(false);
    expect(themeForScheme("dark").navigationTheme.dark).toBe(true);
  });

  it("defines the same semantic variables in both schemes", () => {
    const lightVars = Object.keys(lightTokens);
    const darkVars = Object.keys(darkTokens);
    expect(lightVars.length).toBeGreaterThan(0);
    expect(darkVars.sort()).toEqual([...lightVars].sort());
  });

  it("covers every palette entry with a CSS variable", () => {
    for (const key of paletteKeys) {
      expect(lightTokens[cssVarName(key)]).toBeDefined();
      expect(darkTokens[cssVarName(key)]).toBeDefined();
    }
  });

  it("derives the CSS variables from the palette", () => {
    for (const key of paletteKeys) {
      expect(lightTokens[cssVarName(key)]).toBe(hexToTriplet(palette[key].light));
      expect(darkTokens[cssVarName(key)]).toBe(hexToTriplet(palette[key].dark));
    }
  });

  it("differs between schemes (dark mode actually changes values)", () => {
    expect(lightTokens).not.toEqual(darkTokens);
  });

  it("keeps every palette value a parseable colour", () => {
    for (const key of paletteKeys) {
      expect(palette[key].light).toMatch(HEX);
      expect(palette[key].dark).toMatch(HEX);
    }
  });

  it("only passes plain colour strings to the navigation theme", () => {
    // expo-router cannot carry ColorValue objects through the navigation
    // theme, so a PlatformColor or a var() here would render as nothing.
    for (const scheme of ["light", "dark"] as const) {
      const { colors } = themeForScheme(scheme).navigationTheme;
      for (const value of Object.values(colors)) {
        expect(String(value)).toMatch(HEX);
      }
    }
  });

  it("themes the navigation chrome from the same palette as the tokens", () => {
    for (const scheme of ["light", "dark"] as const) {
      const theme = themeForScheme(scheme);
      expect(theme.navigationTheme.colors.primary).toBe(theme.colors.primary);
      expect(theme.navigationTheme.colors.background).toBe(theme.colors.background);
      // The header and tab bar both paint with `card`.
      expect(theme.navigationTheme.colors.card).toBe(theme.colors.background);
      expect(theme.navigationTheme.colors.text).toBe(theme.colors.text);
      expect(theme.navigationTheme.colors.border).toBe(theme.colors.border);
    }
  });

  it("keeps every stacked layer distinguishable from the one beneath it", () => {
    // [top, bottom]: pairs the UI actually paints on top of each other. Dark
    // mode once had `surface` and `elevated` 3 levels apart, which made the
    // segmented thumb and every card inside a sheet invisible. (`elevated` on
    // `background` is left out: in light mode it is white on white by design,
    // separated by a shadow.)
    const stacks: [PaletteKey, PaletteKey][] = [
      ["surface", "background"],
      ["surfaceHover", "surface"],
      ["selected", "surface"],
      ["border", "surface"],
      ["raised", "elevated"],
      ["raisedHover", "raised"],
      ["border", "raised"],
      ["border", "elevated"],
    ];
    for (const scheme of ["light", "dark"] as const) {
      const colors = resolvePalette(scheme);
      for (const [top, bottom] of stacks) {
        const ratio = contrast(colors[top], colors[bottom]);
        expect({ scheme, top, bottom, ok: ratio >= 1.07 }).toEqual({
          scheme,
          top,
          bottom,
          ok: true,
        });
      }
    }
  });

  it("resolves the whole palette for a scheme", () => {
    expect(resolvePalette("dark").text).toBe(palette.text.dark);
    expect(Object.keys(resolvePalette("dark"))).toEqual(paletteKeys);
  });
});

describe("hexToTriplet", () => {
  it("expands short and full hex forms", () => {
    expect(hexToTriplet("#18181b")).toBe("24 24 27");
    expect(hexToTriplet("#fff")).toBe("255 255 255");
    expect(hexToTriplet("18181b")).toBe("24 24 27");
  });

  it("rejects anything that is not a colour", () => {
    expect(() => hexToTriplet("#12345")).toThrow();
    expect(() => hexToTriplet("rgb(1 2 3)")).toThrow();
  });
});
