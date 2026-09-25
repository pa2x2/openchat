/**
 * The one source of truth for every colour in the app.
 *
 * This file is deliberately plain JS with hex literals and no framework
 * imports: everything else is *derived* from it, so nothing here can drift.
 *
 *   - `theme.ts` turns these into CSS variables (for NativeWind classes) and
 *     into a React Navigation theme (for headers and the tab bar).
 *   - The markdown style map reads them directly (it needs real RN styles,
 *     not Tailwind classes).
 *
 * Do not reach for a raw `var(--oc-*)` string outside `theme.ts`: RN cannot
 * parse CSS variables in a style or a native prop, so such a value is
 * silently dropped at runtime. `noRawCssVars.test.ts` enforces this.
 */

export type ColorSchemeName = "light" | "dark";

export type PaletteEntry = Record<ColorSchemeName, string>;

/** Semantic colour names. Keys are the API; values are per-scheme hex. */
export const palette = {
  /** App canvas. Also the base layer behind every screen. */
  background: { light: "#ffffff", dark: "#212121" },
  /** Cards, list rows, inputs — one step above the canvas. */
  surface: { light: "#f4f4f5", dark: "#2a2a2c" },
  /** Pressed/hover state for surfaces. */
  surfaceHover: { light: "#e4e4e7", dark: "#3a3a3c" },
  /** Scrim behind modals and sheets. */
  overlay: { light: "#000000", dark: "#000000" },
  /** Hairlines and card outlines. */
  border: { light: "#e4e4e7", dark: "#404044" },
  /** Primary body text. */
  text: { light: "#18181b", dark: "#ededed" },
  /** Secondary text: timestamps, hints, placeholders. */
  textMuted: { light: "#71717a", dark: "#9b9ba0" },
  /** Accent: active tab, links, primary buttons. */
  primary: { light: "#10a37f", dark: "#19c37d" },
  /** Text/icon colour that sits on top of `primary` or `danger`. */
  primaryForeground: { light: "#ffffff", dark: "#ffffff" },
  danger: { light: "#dc2626", dark: "#ef4444" },
  success: { light: "#16a34a", dark: "#22c55e" },
  /** Markdown code blocks: panel background. */
  code: { light: "#f4f4f5", dark: "#151517" },
  /** Markdown code text. */
  codeText: { light: "#18181b", dark: "#ededed" },
  /** Markdown code chrome: language label, copy button. */
  codeMuted: { light: "#52525b", dark: "#a1a1aa" },
} satisfies Record<string, PaletteEntry>;

export type PaletteKey = keyof typeof palette;

/** Every semantic name, in a stable order. */
export const paletteKeys = Object.keys(palette) as PaletteKey[];

/** All colours for one scheme, keyed by semantic name. */
export type ResolvedPalette = Record<PaletteKey, string>;

/** Resolve the full palette for a scheme. */
export function resolvePalette(scheme: ColorSchemeName): ResolvedPalette {
  const resolved = {} as ResolvedPalette;
  for (const key of paletteKeys) {
    resolved[key] = palette[key][scheme];
  }
  return resolved;
}

/**
 * `#18181b` -> `"24 24 27"`.
 *
 * Tailwind's `rgb(var(--x) / <alpha-value>)` needs space-separated channels,
 * not a hex string, so the variables are stored in this form.
 */
export function hexToTriplet(hex: string): string {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((char) => char + char)
          .join("")
      : value;
  if (full.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Expected a #rgb or #rrggbb colour, got "${hex}"`);
  }
  const channels = [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16));
  return channels.join(" ");
}
