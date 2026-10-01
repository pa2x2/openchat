import type { ChatSummary } from "@/src/domain";
import { t } from "@/src/i18n";

export interface ChatGroup {
  title: string;
  data: ChatSummary[];
}

function startOfDay(time: Date): number {
  return new Date(time.getFullYear(), time.getMonth(), time.getDate()).getTime();
}

function groupTitle(updatedAt: number, now: Date): string {
  // A chat the server gave no time for would otherwise land in January 1970.
  if (updatedAt <= 0) return t("drawer.groups.older");
  const time = new Date(updatedAt);
  // Calendar days, not 24-hour spans: at 00:30 a chat from 23:50 is yesterday's.
  // Rounded, since a day across a DST change is 23 or 25 hours long.
  const daysAgo = Math.round((startOfDay(now) - startOfDay(time)) / 86_400_000);
  if (daysAgo <= 0) return t("drawer.groups.today");
  if (daysAgo === 1) return t("time.yesterday");
  if (daysAgo <= 7) return t("drawer.groups.week");
  if (daysAgo <= 30) return t("drawer.groups.month");
  const month = t("time.months", { returnObjects: true })[time.getMonth()];
  return time.getFullYear() === now.getFullYear()
    ? month
    : t("drawer.groups.monthYear", { month, year: time.getFullYear() });
}

/** Groups chats sorted newest first into ChatGPT's date sections, in order. */
export function groupChatsByDate(chats: ChatSummary[], now: Date): ChatGroup[] {
  const groups: ChatGroup[] = [];
  for (const chat of chats) {
    const title = groupTitle(chat.updatedAt, now);
    const last = groups.at(-1);
    if (last?.title === title) last.data.push(chat);
    else groups.push({ title, data: [chat] });
  }
  return groups;
}
