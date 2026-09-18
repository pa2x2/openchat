/**
 * Timestamp formatting for chat lists.
 *
 * Hand-rolled instead of Intl to stay identical across Hermes builds with
 * and without full ICU data.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
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
  const day = `${MONTHS[date.getMonth()]} ${date.getDate()}`;
  return sameYear ? day : `${day}, ${date.getFullYear()}`;
}
