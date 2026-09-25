import { useMemo } from "react";
import { useColorScheme, vars } from "nativewind";
import { DarkTheme, DefaultTheme, type Theme } from "expo-router";
import {
  hexToTriplet,
  palette,
  paletteKeys,
  resolvePalette,
  type ColorSchemeName,
  type ResolvedPalette,
} from "./palette";

/**
 * Theming has two consumers with two different needs, and both are fed from
 * `palette.ts`:
 *
 *  1. NativeWind classes (`bg-surface`, `text-text-muted`, ...). These read
 *     CSS variables, which Tailwind maps in `tailwind.config.js`. On native,
 *     `vars()` is a JS variable *context*, not a real CSS cascade: only styles
 *     NativeWind compiles can see it. The root layout applies it once.
 *
 *  2. Everything that is not a NativeWind style — React Navigation headers and
 *     the tab bar, native props like `placeholderTextColor`, and third-party
 *     renderers that take real RN styles. These need concrete colour strings,
 *     so they read `colors` / `navigationTheme` instead.
 *
 * Never pass a `var(--oc-*)` string to (2). RN cannot parse it and drops it
 * silently; `noRawCssVars.test.ts` fails the build if you try.
 */

export type { ColorSchemeName } from "./palette";
export { palette, paletteKeys, resolvePalette, hexToTriplet, withAlpha } from "./palette";
export type { PaletteKey, ResolvedPalette } from "./palette";

/** CSS variable name for a semantic colour, matching `tailwind.config.js`. */
export function cssVarName(key: keyof typeof palette): `--oc-${string}` {
  return `--oc-${key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}`;
}

/**
 * Tokens as space-separated RGB triplets, derived from the palette. These
 * exist so `bg-background/10` style alpha utilities keep working.
 */
export const lightTokens = Object.fromEntries(
  paletteKeys.map((key) => [cssVarName(key), hexToTriplet(palette[key].light)]),
) as Record<`--oc-${string}`, string>;

export const darkTokens: Record<keyof typeof lightTokens, string> = Object.fromEntries(
  paletteKeys.map((key) => [cssVarName(key), hexToTriplet(palette[key].dark)]),
) as Record<`--oc-${string}`, string>;

export const themes: Record<ColorSchemeName, object> = {
  light: vars(lightTokens),
  dark: vars(darkTokens),
};

const resolvedByScheme: Record<ColorSchemeName, ResolvedPalette> = {
  light: resolvePalette("light"),
  dark: resolvePalette("dark"),
};

/**
 * React Navigation theme, built from the same palette.
 *
 * Only the `colors` map is overridden; `fonts` and the rest come from
 * `DefaultTheme`/`DarkTheme` because this project uses the platform defaults.
 * The values must stay plain strings — expo-router cannot yet pass ColorValue
 * objects through the navigation theme (see its `global-state/utils.js`).
 */
const navigationThemes: Record<ColorSchemeName, Theme> = {
  light: {
    ...DefaultTheme,
    dark: false,
    colors: {
      ...DefaultTheme.colors,
      primary: resolvedByScheme.light.primary,
      background: resolvedByScheme.light.background,
      card: resolvedByScheme.light.background,
      text: resolvedByScheme.light.text,
      border: resolvedByScheme.light.border,
      notification: resolvedByScheme.light.danger,
    },
  },
  dark: {
    ...DarkTheme,
    dark: true,
    colors: {
      ...DarkTheme.colors,
      primary: resolvedByScheme.dark.primary,
      background: resolvedByScheme.dark.background,
      card: resolvedByScheme.dark.background,
      text: resolvedByScheme.dark.text,
      border: resolvedByScheme.dark.border,
      notification: resolvedByScheme.dark.danger,
    },
  },
};

export interface AppTheme {
  scheme: ColorSchemeName;
  /** Concrete hex colours for the active scheme. */
  colors: ResolvedPalette;
  /** `vars()` style for the single root View. */
  vars: object;
  /** Pass to `<ThemeProvider>` so headers and the tab bar follow the scheme. */
  navigationTheme: Theme;
  /**
   * `boxShadow` for floating chrome (header buttons, the composer). Shadows
   * barely read on a dark canvas, so dark mode leans on `elevated` instead.
   */
  floatingShadow: string;
}

const floatingShadows: Record<ColorSchemeName, string> = {
  light: "0px 1px 2px rgba(0, 0, 0, 0.06), 0px 4px 16px rgba(0, 0, 0, 0.08)",
  dark: "0px 1px 2px rgba(0, 0, 0, 0.4), 0px 4px 16px rgba(0, 0, 0, 0.45)",
};

/** Resolved theme for an explicit scheme, without subscribing to changes. */
export function themeForScheme(scheme: ColorSchemeName): AppTheme {
  return {
    scheme,
    colors: resolvedByScheme[scheme],
    vars: themes[scheme],
    navigationTheme: navigationThemes[scheme],
    floatingShadow: floatingShadows[scheme],
  };
}

/**
 * The app theme. Wraps NativeWind's `useColorScheme` (not React Navigation's
 * `useTheme`) so there is one notion of the active scheme, and hands back both
 * representations of it.
 */
export function useAppTheme(): AppTheme {
  const { colorScheme } = useColorScheme();
  const scheme: ColorSchemeName = colorScheme === "dark" ? "dark" : "light";
  return useMemo(() => themeForScheme(scheme), [scheme]);
}
