import {
  darkTokens,
  hexToTriplet,
  lightTokens,
  palette,
  paletteKeys,
  resolvePalette,
  themeForScheme,
  type PaletteKey,
} from "../theme";
import { resolveDynamicPalette } from "../dynamicPalette";
import { bluePalettes, vibrantOrangePalettes } from "./fixtures/systemPalettes";
import { contrast } from "./helpers/contrast";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tailwindConfig = require("../../../tailwind.config.js");

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

describe("theme", () => {
  it("defines every CSS variable tailwind.config.js reads", () => {
    // The Tailwind colour map is written by hand. A name that drifts from the
    // palette compiles fine and renders as no colour at all.
    const colors: Record<string, string> = tailwindConfig.theme.extend.colors;
    const referenced = Object.values(colors).map(
      (value) => /var\((--oc-[a-z-]+)\)/.exec(value)?.[1],
    );
    expect(referenced).not.toContain(undefined);
    for (const name of referenced) {
      expect(Object.keys(lightTokens)).toContain(name);
      expect(Object.keys(darkTokens)).toContain(name);
    }
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
    for (const system of [null, bluePalettes, vibrantOrangePalettes]) {
      for (const scheme of ["light", "dark"] as const) {
        const { colors } = themeForScheme(scheme, system).navigationTheme;
        for (const value of Object.values(colors)) {
          expect(String(value)).toMatch(HEX);
        }
      }
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
    // Material You palettes too: their surfaces come from a tone table in
    // dynamicPalette.ts, and two tones a step apart can be just as invisible.
    const sources = { static: null, blue: bluePalettes, vibrantOrange: vibrantOrangePalettes };
    for (const [source, system] of Object.entries(sources)) {
      for (const scheme of ["light", "dark"] as const) {
        const colors = system ? resolveDynamicPalette(system, scheme) : resolvePalette(scheme);
        for (const [top, bottom] of stacks) {
          const ratio = contrast(colors[top], colors[bottom]);
          expect({ source, scheme, top, bottom, ok: ratio >= 1.07 }).toEqual({
            source,
            scheme,
            top,
            bottom,
            ok: true,
          });
        }
      }
    }
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
