import type { ChatSummary } from "@/src/domain";

export interface ChatGroup {
  title: string;
  data: ChatSummary[];
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function startOfDay(time: Date): number {
  return new Date(time.getFullYear(), time.getMonth(), time.getDate()).getTime();
}

function groupTitle(updatedAt: number, now: Date): string {
  // A chat the server gave no time for would otherwise land in January 1970.
  if (updatedAt <= 0) return "Older";
  const time = new Date(updatedAt);
  // Calendar days, not 24-hour spans: at 00:30 a chat from 23:50 is yesterday's.
  // Rounded, since a day across a DST change is 23 or 25 hours long.
  const daysAgo = Math.round((startOfDay(now) - startOfDay(time)) / 86_400_000);
  if (daysAgo <= 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  if (daysAgo <= 7) return "Previous 7 days";
  if (daysAgo <= 30) return "Previous 30 days";
  const month = MONTHS[time.getMonth()];
  return time.getFullYear() === now.getFullYear() ? month : `${month} ${time.getFullYear()}`;
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
