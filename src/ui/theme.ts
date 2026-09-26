import { useColorScheme, vars } from "nativewind";
import { DarkTheme, DefaultTheme, type Theme } from "expo-router";
import type { SystemPalettes } from "@/modules/dynamic-colors";
import { useSettingsStore } from "@/src/stores/settings";
import { resolveDynamicPalette } from "./dynamicPalette";
import {
  hexToTriplet,
  palette,
  paletteKeys,
  resolvePalette,
  type ColorSchemeName,
  type ResolvedPalette,
} from "./palette";
import { useSystemPalettesStore } from "./systemPalettes";

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
 * With the "dynamic" colour setting the same keys are filled from the
 * device's Material You palettes instead (`dynamicPalette.ts`); both
 * consumers follow along, since both read the theme built here.
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
 * Tokens as space-separated RGB triplets, keyed by CSS variable name. These
 * exist so `bg-background/10` style alpha utilities keep working.
 */
function tokensFor(colors: ResolvedPalette): Record<`--oc-${string}`, string> {
  return Object.fromEntries(
    paletteKeys.map((key) => [cssVarName(key), hexToTriplet(colors[key])]),
  ) as Record<`--oc-${string}`, string>;
}

export const lightTokens = tokensFor(resolvePalette("light"));
export const darkTokens: Record<keyof typeof lightTokens, string> = tokensFor(
  resolvePalette("dark"),
);

/**
 * React Navigation theme, built from the same palette.
 *
 * Only the `colors` map is overridden; `fonts` and the rest come from
 * `DefaultTheme`/`DarkTheme` because this project uses the platform defaults.
 * The values must stay plain strings — expo-router cannot yet pass ColorValue
 * objects through the navigation theme (see its `global-state/utils.js`).
 */
function navigationThemeFor(scheme: ColorSchemeName, colors: ResolvedPalette): Theme {
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark: scheme === "dark",
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.border,
      notification: colors.danger,
    },
  };
}

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

function buildTheme(scheme: ColorSchemeName, colors: ResolvedPalette): AppTheme {
  return {
    scheme,
    colors,
    vars: vars(tokensFor(colors)),
    navigationTheme: navigationThemeFor(scheme, colors),
    floatingShadow: floatingShadows[scheme],
  };
}

const staticThemes: Record<ColorSchemeName, AppTheme> = {
  light: buildTheme("light", resolvePalette("light")),
  dark: buildTheme("dark", resolvePalette("dark")),
};

export const themes: Record<ColorSchemeName, object> = {
  light: staticThemes.light.vars,
  dark: staticThemes.dark.vars,
};

// One theme object per palette set and scheme, so every `useAppTheme` caller
// shares it and memoised styles keyed on `colors` stay stable.
const dynamicThemes = new WeakMap<SystemPalettes, Partial<Record<ColorSchemeName, AppTheme>>>();

/**
 * Resolved theme for an explicit scheme, without subscribing to changes.
 * Pass the system palettes to get Material You colours; null (or omitted)
 * gives the static palette.
 */
export function themeForScheme(
  scheme: ColorSchemeName,
  systemPalettes: SystemPalettes | null = null,
): AppTheme {
  if (!systemPalettes) return staticThemes[scheme];
  let byScheme = dynamicThemes.get(systemPalettes);
  if (!byScheme) {
    byScheme = {};
    dynamicThemes.set(systemPalettes, byScheme);
  }
  return (byScheme[scheme] ??= buildTheme(scheme, resolveDynamicPalette(systemPalettes, scheme)));
}

/**
 * The app theme. Wraps NativeWind's `useColorScheme` (not React Navigation's
 * `useTheme`) so there is one notion of the active scheme, and hands back both
 * representations of it. With the "dynamic" colour setting it uses the
 * device's Material You palettes, and falls back to the static palette where
 * there are none (iOS, Android before 12).
 */
export function useAppTheme(): AppTheme {
  const { colorScheme } = useColorScheme();
  const scheme: ColorSchemeName = colorScheme === "dark" ? "dark" : "light";
  const dynamic = useSettingsStore((state) => state.colorSource === "dynamic");
  const systemPalettes = useSystemPalettesStore((state) => state.palettes);
  return themeForScheme(scheme, dynamic ? systemPalettes : null);
}
