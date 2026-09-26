import type { ColorSchemeName, PaletteKey } from "../palette";
import { paletteTone, resolveDynamicPalette } from "../dynamicPalette";
import { bluePalettes, vibrantOrangePalettes } from "./fixtures/systemPalettes";
import { contrast } from "./helpers/contrast";

/** CIE L* of a hex colour, which is what Material calls tone. */
function lightness(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y;
}

describe("paletteTone", () => {
  const accent = bluePalettes.accent1;

  it("returns Android's own colour for the tones it names", () => {
    // Shade numbers are not tones: "600" is tone 40, and "10" and "50" break
    // the pattern (tones 99 and 95).
    expect(paletteTone(accent, 40)).toBe(accent["600"]);
    expect(paletteTone(accent, 80)).toBe(accent["200"]);
    expect(paletteTone(accent, 95)).toBe(accent["50"]);
    expect(paletteTone(accent, 99)).toBe(accent["10"]);
    expect(paletteTone(accent, 0)).toBe(accent["1000"]);
  });

  it("lands in-between tones on the requested lightness", () => {
    for (const tone of [6, 12, 17, 27, 88, 94, 98]) {
      expect(Math.abs(lightness(paletteTone(bluePalettes.neutral1, tone)) - tone)).toBeLessThan(
        0.7,
      );
    }
  });
});

describe("resolveDynamicPalette", () => {
  // [foreground, background, minimum ratio]: text the UI actually draws on
  // each layer. 4.5 is WCAG AA for body text; placeholders get 3.
  const readable: [PaletteKey, PaletteKey, number][] = [
    ["text", "background", 4.5],
    ["text", "surface", 4.5],
    ["text", "raised", 4.5],
    ["text", "selected", 4.5],
    ["textMuted", "background", 4.5],
    ["textMuted", "surface", 4.5],
    ["textMuted", "elevated", 4.5],
    ["textFaint", "surface", 2.5],
    ["primaryForeground", "primary", 4.5],
    ["primaryForeground", "danger", 4.5],
    ["userBubbleText", "userBubble", 4.5],
    ["codeText", "code", 4.5],
    ["codeMuted", "code", 4.5],
    ["primary", "background", 3],
    ["danger", "background", 3],
  ];

  const cases: [string, typeof bluePalettes][] = [
    ["blue", bluePalettes],
    ["vibrant orange", vibrantOrangePalettes],
  ];

  it.each(cases)("keeps text readable with the %s wallpaper", (_, system) => {
    for (const scheme of ["light", "dark"] as ColorSchemeName[]) {
      const colors = resolveDynamicPalette(system, scheme);
      for (const [fg, bg, min] of readable) {
        const ratio = Math.round(contrast(colors[fg], colors[bg]) * 100) / 100;
        expect({ scheme, fg, bg, ok: ratio >= min, ratio }).toEqual({
          scheme,
          fg,
          bg,
          ok: true,
          ratio,
        });
      }
    }
  });

  it("takes its hue from the wallpaper", () => {
    // The whole point: a different wallpaper must change the app, including
    // its surfaces, not just the accent.
    for (const scheme of ["light", "dark"] as ColorSchemeName[]) {
      const blue = resolveDynamicPalette(bluePalettes, scheme);
      const orange = resolveDynamicPalette(vibrantOrangePalettes, scheme);
      for (const key of ["background", "surface", "primary", "userBubble"] as PaletteKey[]) {
        expect(orange[key]).not.toBe(blue[key]);
      }
    }
  });
});
