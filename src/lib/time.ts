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

/**
 * How long ago, for a short list of recent things: minutes, then hours for
 * the rest of today, "Yesterday", and a short date from there on.
 */
export function formatRelative(epochMs: number, now = new Date()): string {
  const minutes = Math.floor((now.getTime() - epochMs) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (epochMs >= today.getTime()) return `${Math.floor(minutes / 60)} h ago`;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (epochMs >= yesterday.getTime()) return "Yesterday";
  return formatTimestamp(epochMs, now);
}
