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
  background: { light: "#ffffff", dark: "#121212" },
  /** Grouped rows, inputs, search fields — one step above the canvas. */
  surface: { light: "#f4f4f4", dark: "#212121" },
  /** Pressed state for surfaces. */
  surfaceHover: { light: "#ececec", dark: "#2e2e2e" },
  /** Floating chrome: header buttons, the composer, sheets and menus. */
  elevated: { light: "#ffffff", dark: "#262626" },
  /**
   * Cards, tiles and pressed rows *inside* `elevated` chrome (sheet cards,
   * menu rows, composer chips). In light mode that is just `surface`, but in
   * dark mode elevation gets lighter, so `surface` would vanish on a sheet.
   */
  raised: { light: "#f4f4f4", dark: "#333333" },
  /** Pressed state for `raised`. */
  raisedHover: { light: "#ececec", dark: "#3f3f3f" },
  /** The chosen option's thumb in a segmented control on a `surface` card. */
  selected: { light: "#ffffff", dark: "#3a3a3a" },
  /** Scrim behind modals and sheets. */
  overlay: { light: "#000000", dark: "#000000" },
  /** Hairlines and card outlines. */
  border: { light: "#e5e5e5", dark: "#3d3d3d" },
  /** Primary body text. */
  text: { light: "#0d0d0d", dark: "#ececec" },
  /** Secondary text: timestamps, hints, section labels. */
  textMuted: { light: "#6b6b6b", dark: "#a3a3a3" },
  /** Placeholders and disabled icons. */
  textFaint: { light: "#9a9a9a", dark: "#707070" },
  /** Accent: send button, links, checks, toggles. */
  primary: { light: "#2f7bf5", dark: "#4b8ffa" },
  /** Text/icon colour that sits on top of `primary` or `danger`. */
  primaryForeground: { light: "#ffffff", dark: "#ffffff" },
  /** The user's own messages. */
  userBubble: { light: "#e8f2fe", dark: "#1c2d45" },
  userBubbleText: { light: "#1f5eb4", dark: "#b3d1ff" },
  danger: { light: "#e02e2a", dark: "#ef4444" },
  success: { light: "#1fa463", dark: "#22c55e" },
  /** Markdown code blocks: panel background. */
  code: { light: "#f7f7f8", dark: "#1b1b1b" },
  /** Markdown code text. */
  codeText: { light: "#0d0d0d", dark: "#ececec" },
  /** Markdown code chrome: language label, copy button. */
  codeMuted: { light: "#6b6b6b", dark: "#a1a1aa" },
  /** Decorative icon tints, e.g. the new-chat suggestion chips. */
  tintViolet: { light: "#c061cb", dark: "#dc8add" },
  tintAmber: { light: "#e5a50a", dark: "#f6d32d" },
  tintGreen: { light: "#2ec27e", dark: "#57e389" },
  tintBlue: { light: "#3584e4", dark: "#62a0ea" },
  tintOrange: { light: "#e66100", dark: "#ffa348" },
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

/**
 * `#ffffff`, 0.5 -> `"rgba(255, 255, 255, 0.5)"`.
 *
 * For the places that need a translucent version of a palette colour as a
 * real style value: fades behind floating chrome and shadows.
 */
export function withAlpha(hex: string, alpha: number): string {
  return `rgba(${hexToTriplet(hex).split(" ").join(", ")}, ${alpha})`;
}
