/**
 * Material You: the app palette rebuilt from Android's wallpaper colours.
 *
 * Android hands over five tonal palettes, each a hue at fixed tones (Material
 * tone = CIE L*, 0 black to 100 white). Every semantic key below picks one
 * palette and one tone per scheme, so the whole UI takes the wallpaper's hue
 * while keeping the layering of the static palette: the neutral tones sit
 * close to the lightness of the greys in `palette.ts`.
 *
 * Android only ships 13 tones, and the layered surfaces need the ones between
 * (dark `background` is tone 6), so those are interpolated in CIELAB. L* is
 * the tone, so the in-between colour lands exactly on the requested tone.
 *
 * Status and decorative colours (`success`, the `tint*` icons) keep their
 * fixed hues, as Material does for its error colour.
 */

import type { SystemPalette, SystemPaletteName, SystemPalettes } from "@/modules/dynamic-colors";
import {
  hexToTriplet,
  resolvePalette,
  type ColorSchemeName,
  type PaletteKey,
  type ResolvedPalette,
} from "./palette";

/** Material tone for each shade Android names. */
const SHADE_TONES: readonly [shade: string, tone: number][] = [
  ["1000", 0],
  ["900", 10],
  ["800", 20],
  ["700", 30],
  ["600", 40],
  ["500", 50],
  ["400", 60],
  ["300", 70],
  ["200", 80],
  ["100", 90],
  ["50", 95],
  ["10", 99],
  ["0", 100],
];

type Lab = [l: number, a: number, b: number];

// D65 white point, as sRGB uses.
const WHITE = [0.95047, 1, 1.08883];

function toLab(hex: string): Lab {
  const [r, g, b] = hexToTriplet(hex)
    .split(" ")
    .map((channel) => {
      const c = Number(channel) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
  const xyz = [
    0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    0.0193339 * r + 0.119192 * g + 0.9503041 * b,
  ];
  const [fx, fy, fz] = xyz.map((value, i) => {
    const t = value / WHITE[i];
    return t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116;
  });
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function fromLab([l, a, b]: Lab): string {
  const fy = (l + 16) / 116;
  const f = [fy + a / 500, fy, fy - b / 200];
  const [x, y, z] = f.map((value, i) => {
    const cubed = value ** 3;
    return WHITE[i] * (cubed > 216 / 24389 ? cubed : (116 * value - 16) / (24389 / 27));
  });
  const rgb = [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ].map((linear) => {
    const c = linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(Math.max(c, 0), 1) * 255);
  });
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** The colour at a Material tone (0-100) of one system palette. */
export function paletteTone(system: SystemPalette, tone: number): string {
  const upper = SHADE_TONES.findIndex(([, shadeTone]) => shadeTone >= tone);
  if (upper === -1) throw new Error(`Tone ${tone} is out of range`);
  const [upperShade, upperTone] = SHADE_TONES[upper];
  if (upperTone === tone || upper === 0) return system[upperShade];
  const [lowerShade, lowerTone] = SHADE_TONES[upper - 1];
  const t = (tone - lowerTone) / (upperTone - lowerTone);
  const from = toLab(system[lowerShade]);
  const to = toLab(system[upperShade]);
  return fromLab(from.map((value, i) => value + (to[i] - value) * t) as Lab);
}

type Role = { palette: SystemPaletteName } & Record<ColorSchemeName, number>;

/**
 * Palette and tone per semantic key. `neutral1` is Material's surface and
 * text palette, `neutral2` its variant (outlines, secondary text), `accent1`
 * primary and `accent2` secondary. Keys not listed keep their static colour.
 */
const ROLES: Partial<Record<PaletteKey, Role>> = {
  background: { palette: "neutral1", light: 98, dark: 6 },
  surface: { palette: "neutral1", light: 94, dark: 12 },
  surfaceHover: { palette: "neutral1", light: 90, dark: 18 },
  elevated: { palette: "neutral1", light: 99, dark: 15 },
  raised: { palette: "neutral1", light: 94, dark: 21 },
  raisedHover: { palette: "neutral1", light: 90, dark: 27 },
  selected: { palette: "accent2", light: 90, dark: 30 },
  border: { palette: "neutral2", light: 88, dark: 30 },
  text: { palette: "neutral1", light: 10, dark: 90 },
  textMuted: { palette: "neutral2", light: 40, dark: 70 },
  textFaint: { palette: "neutral2", light: 60, dark: 50 },
  primary: { palette: "accent1", light: 40, dark: 80 },
  primaryForeground: { palette: "accent1", light: 100, dark: 20 },
  userBubble: { palette: "accent1", light: 90, dark: 30 },
  userBubbleText: { palette: "accent1", light: 10, dark: 90 },
  code: { palette: "neutral1", light: 96, dark: 10 },
  codeText: { palette: "neutral1", light: 10, dark: 90 },
  codeMuted: { palette: "neutral2", light: 40, dark: 70 },
};

/**
 * Material's error colour. Its hue is fixed, but the tones must pair with
 * `primaryForeground`, which also sits on `danger`: in dark mode that is a
 * dark tone, so `danger` has to be light.
 */
const DANGER: Record<ColorSchemeName, string> = { light: "#ba1a1a", dark: "#ffb4ab" };

export function resolveDynamicPalette(
  system: SystemPalettes,
  scheme: ColorSchemeName,
): ResolvedPalette {
  const resolved = resolvePalette(scheme);
  for (const [key, role] of Object.entries(ROLES) as [PaletteKey, Role][]) {
    resolved[key] = paletteTone(system[role.palette], role[scheme]);
  }
  resolved.danger = DANGER[scheme];
  return resolved;
}
