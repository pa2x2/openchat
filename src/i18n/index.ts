/**
 * Translations. English is the source catalog: every other language is
 * checked against it by the compiler, and a key a language lacks at runtime
 * falls back to it.
 *
 * `t` works outside React too (stores, the stream machine, providers), but
 * what it returns is fixed in the language of the moment: an error kept in a
 * store stays in the language it was raised in. Components read strings
 * through `useTranslation`, which re-renders them when the language changes.
 */

// Hermes on Android has no Intl.PluralRules, which i18next picks plural
// forms with; without it every count reads as English one/other.
import "@formatjs/intl-pluralrules/polyfill.js";
import "@formatjs/intl-pluralrules/locale-data/en.js";
import "@formatjs/intl-pluralrules/locale-data/ru.js";
import i18n, { changeLanguage, use as addPlugin } from "i18next";
import { initReactI18next } from "react-i18next";
import { getLocales } from "expo-localization";
import en from "./locales/en";
import ru from "./locales/ru";

const resources = {
  en: { translation: en },
  ru: { translation: ru },
};

export type Language = keyof typeof resources;

/** "system" follows the device's preferred languages. */
export type LanguageSetting = "system" | Language;

/** Each language's name in itself, as language pickers list them. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  ru: "Русский",
};

function isLanguage(code: string | null): code is Language {
  return code !== null && Object.hasOwn(resources, code);
}

/** The first of the device's preferred languages the app has, else English. */
export function systemLanguage(): Language {
  return (
    getLocales()
      .map((locale) => locale.languageCode)
      .find(isLanguage) ?? "en"
  );
}

export function resolveLanguage(setting: LanguageSetting): Language {
  return setting === "system" ? systemLanguage() : setting;
}

void addPlugin(initReactI18next).init({
  resources,
  lng: systemLanguage(),
  fallbackLng: "en",
  // Resources are bundled, so there is nothing to wait for and the first
  // render already has its strings.
  initAsync: false,
  // React escapes what it renders; i18next escaping would show `&amp;`.
  interpolation: { escapeValue: false },
});

export function applyLanguage(setting: LanguageSetting): void {
  const language = resolveLanguage(setting);
  if (i18n.language !== language) void changeLanguage(language);
}

export { t } from "i18next";
