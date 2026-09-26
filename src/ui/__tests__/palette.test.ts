import { resolveDynamicPalette } from "../dynamicPalette";
import {
  darkTokens,
  hexToTriplet,
  lightTokens,
  resolvePalette,
  type ColorSchemeName,
  type PaletteKey,
  type ResolvedPalette,
} from "../theme";
import { vibrantOrangePalettes } from "./fixtures/systemPalettes";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tailwindConfig = require("../../../tailwind.config.js");

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

const palettes: [string, ResolvedPalette][] = (["light", "dark"] as ColorSchemeName[]).flatMap(
  (scheme): [string, ResolvedPalette][] => [
    [`static ${scheme}`, resolvePalette(scheme)],
    [`wallpaper ${scheme}`, resolveDynamicPalette(vibrantOrangePalettes, scheme)],
  ],
);

function failing(colors: ResolvedPalette, pairs: [PaletteKey, PaletteKey, number][]) {
  return pairs
    .map(([fg, bg, min]) => ({ fg, bg, min, ratio: contrast(colors[fg], colors[bg]) }))
    .filter(({ ratio, min }) => ratio < min);
}

it("defines every CSS variable tailwind.config.js reads", () => {
  // The Tailwind colour map is written by hand. A name that drifts from the
  // palette compiles fine and renders as no colour at all.
  const colors: Record<string, string> = tailwindConfig.theme.extend.colors;
  for (const value of Object.values(colors)) {
    const name = /var\((--oc-[a-z-]+)\)/.exec(value)?.[1];
    expect(Object.keys(lightTokens)).toContain(name);
    expect(Object.keys(darkTokens)).toContain(name);
  }
});

const wallpaperPalettes = palettes.filter(([name]) => name.startsWith("wallpaper"));

it.each(wallpaperPalettes)("keeps text readable in the %s palette", (_, colors) => {
  // [foreground, background, minimum ratio]: text the UI actually draws on
  // each layer. 4.5 is WCAG AA for body text. The static palette is picked by
  // hand; this guards the colours derived from the user's wallpaper.
  expect(
    failing(colors, [
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
    ]),
  ).toEqual([]);
});

it.each(palettes)("keeps stacked layers visible in the %s palette", (_, colors) => {
  // [top, bottom]: layers the UI paints on each other. Dark mode once had
  // `surface` and `elevated` 3 levels apart, which made the segmented thumb
  // and every card inside a sheet invisible. (`elevated` on `background` is
  // left out: in light mode it is white on white, separated by a shadow.)
  expect(
    failing(colors, [
      ["surface", "background", 1.07],
      ["surfaceHover", "surface", 1.07],
      ["selected", "surface", 1.07],
      ["border", "surface", 1.07],
      ["raised", "elevated", 1.07],
      ["raisedHover", "raised", 1.07],
      ["border", "raised", 1.07],
      ["border", "elevated", 1.07],
    ]),
  ).toEqual([]);
});
