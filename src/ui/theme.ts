import { vars } from "nativewind";

/**
 * Design tokens for OpenChat.
 *
 * Colors are space-separated RGB triplets exposed as CSS variables; the
 * Tailwind config maps semantic color names onto them. This is the
 * NativeWind v4 "switching themes" pattern: a root View applies the
 * `vars()` style for the active scheme, and every semantic class
 * (bg-background, text-primary, ...) resolves against those variables.
 */

export type ColorSchemeName = "light" | "dark";

export const lightTokens = {
  "--oc-background": "255 255 255",
  "--oc-surface": "244 244 245",
  "--oc-surface-hover": "228 228 231",
  "--oc-overlay": "0 0 0",
  "--oc-border": "228 228 231",
  "--oc-text": "24 24 27",
  "--oc-text-muted": "113 113 122",
  "--oc-primary": "16 163 127",
  "--oc-primary-foreground": "255 255 255",
  "--oc-danger": "220 38 38",
} satisfies Record<`--oc-${string}`, string>;

export const darkTokens: Record<keyof typeof lightTokens, string> = {
  "--oc-background": "33 33 33",
  "--oc-surface": "42 42 44",
  "--oc-surface-hover": "58 58 60",
  "--oc-overlay": "0 0 0",
  "--oc-border": "64 64 68",
  "--oc-text": "237 237 237",
  "--oc-text-muted": "155 155 160",
  "--oc-primary": "25 195 125",
  "--oc-primary-foreground": "255 255 255",
  "--oc-danger": "239 68 68",
};

export const lightTheme = vars(lightTokens);
export const darkTheme = vars(darkTokens);

export const themes: Record<ColorSchemeName, object> = {
  light: lightTheme,
  dark: darkTheme,
};
