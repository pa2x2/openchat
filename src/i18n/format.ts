/**
 * Numbers in the current language. Separators come from the catalog rather
 * than Intl, which Hermes formats differently with and without full ICU data.
 */

import type { TFunction } from "i18next";

/** Fixed to `digits` decimals, with the language's separators: `12,345.6` or `12 345,6`. */
export function formatNumber(t: TFunction, value: number, digits = 0): string {
  const [whole, fraction] = value.toFixed(digits).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, t("format.groupSeparator"));
  return fraction === undefined ? grouped : `${grouped}${t("format.decimalSeparator")}${fraction}`;
}
