/**
 * Timestamp formatting for chat lists.
 *
 * Hand-rolled instead of Intl to stay identical across Hermes builds with
 * and without full ICU data; the names and word order come from the catalog.
 */

import { t } from "@/src/i18n";

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatWeekday(date: Date): string {
  return t("time.weekdaysShort", { returnObjects: true })[date.getDay()];
}

export function formatMonthDay(date: Date): string {
  return t("time.monthDay", {
    month: t("time.monthsShort", { returnObjects: true })[date.getMonth()],
    day: date.getDate(),
  });
}

/** Same-day timestamps show the time, older ones a short date. */
export function formatTimestamp(epochMs: number, now = new Date()): string {
  const date = new Date(epochMs);
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  const sameYear = date.getFullYear() === now.getFullYear();
  const day = formatMonthDay(date);
  return sameYear ? day : t("time.monthDayYear", { day, year: date.getFullYear() });
}

/**
 * How long ago, for a short list of recent things: minutes, then hours for
 * the rest of today, "Yesterday", and a short date from there on.
 */
export function formatRelative(epochMs: number, now = new Date()): string {
  const minutes = Math.floor((now.getTime() - epochMs) / 60_000);
  if (minutes < 1) return t("time.justNow");
  if (minutes < 60) return t("time.minutesAgo", { count: minutes });
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (epochMs >= today.getTime()) return t("time.hoursAgo", { count: Math.floor(minutes / 60) });
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (epochMs >= yesterday.getTime()) return t("time.yesterday");
  return formatTimestamp(epochMs, now);
}
