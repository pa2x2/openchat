/**
 * What the task sheet edits, and how a schedule reads to the user.
 *
 * The sheet offers four kinds: once, chosen days at a time, an interval and
 * a typed cron line. Days at a time are written as a cron line too, so a
 * cron line of that shape opens as days again.
 */

import type { TFunction } from "i18next";
import type { TaskSchedule } from "@/src/domain";
import { formatMonthDay } from "@/src/lib/time";

export type ScheduleKind = "at" | "days" | "every" | "cron";
export type EveryUnit = "minutes" | "hours" | "days";

export interface ScheduleForm {
  kind: ScheduleKind;
  /** Epoch ms, for "at". */
  at: number;
  /** Minutes past midnight in the server's zone, for "days". */
  time: number;
  /** 0 is Sunday, as in cron. */
  days: number[];
  every: { count: number; unit: EveryUnit };
  cron: string;
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];
const DAYS_CRON = /^(\d{1,2}) (\d{1,2}) \* \* (\*|1-5|[0-7](?:,[0-7])*)$/;
const EVERY = /^(\d+)\s*(minute|hour|day)s?$/i;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatClock(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

function parseDays(field: string): number[] {
  if (field === "*") return ALL_DAYS;
  if (field === "1-5") return WEEKDAYS;
  return [...new Set(field.split(",").map((day) => Number(day) % 7))].sort();
}

function daysField(days: readonly number[]): string {
  if (days.length === 7) return "*";
  if (days.length === 5 && WEEKDAYS.every((day) => days.includes(day))) return "1-5";
  return [...days].sort().join(",");
}

function parseDaysCron(cron: string): { time: number; days: number[] } | null {
  const match = DAYS_CRON.exec(cron.trim());
  if (!match) return null;
  const minute = Number(match[1]);
  const hour = Number(match[2]);
  if (minute > 59 || hour > 23) return null;
  return { time: hour * 60 + minute, days: parseDays(match[3]) };
}

function parseEvery(every: string): ScheduleForm["every"] | null {
  const match = EVERY.exec(every.trim());
  if (!match) return null;
  return { count: Number(match[1]), unit: `${match[2].toLowerCase()}s` as EveryUnit };
}

/** The form for a task's schedule; a new task's starts at tomorrow's 9:00, weekdays. */
export function scheduleForm(schedule: TaskSchedule | null, now = Date.now()): ScheduleForm {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const form: ScheduleForm = {
    kind: "days",
    at: tomorrow.getTime(),
    time: 9 * 60,
    days: WEEKDAYS,
    every: { count: 1, unit: "hours" },
    cron: "0 9 * * 1-5",
  };
  if (!schedule) return form;
  switch (schedule.type) {
    case "at":
      return { ...form, kind: "at", at: schedule.at };
    case "every": {
      const every = parseEvery(schedule.every);
      return every ? { ...form, kind: "every", every } : form;
    }
    case "cron": {
      const days = parseDaysCron(schedule.cron);
      return days ? { ...form, ...days } : { ...form, kind: "cron", cron: schedule.cron };
    }
  }
}

export function toSchedule(form: ScheduleForm): TaskSchedule {
  switch (form.kind) {
    case "at":
      return { type: "at", at: form.at };
    case "days":
      return {
        type: "cron",
        cron: `${form.time % 60} ${Math.floor(form.time / 60)} * * ${daysField(form.days)}`,
      };
    case "every":
      return { type: "every", every: `${form.every.count} ${form.every.unit}` };
    case "cron":
      return { type: "cron", cron: form.cron.trim() };
  }
}

export function scheduleProblem(t: TFunction, form: ScheduleForm, now = Date.now()): string | null {
  switch (form.kind) {
    case "at":
      return form.at <= now ? t("scheduled.problem.past") : null;
    case "days":
      return form.days.length === 0 ? t("scheduled.problem.noDays") : null;
    case "every":
      return form.every.count < 1 ? t("scheduled.problem.interval") : null;
    case "cron":
      return form.cron.trim().split(/\s+/).length === 5 ? null : t("scheduled.problem.cron");
  }
}

function describeDays(t: TFunction, days: readonly number[]): string {
  if (days.length === 7) return t("scheduled.days.every");
  if (daysField(days) === "1-5") return t("scheduled.days.weekdays");
  if (days.length === 2 && days.includes(0) && days.includes(6))
    return t("scheduled.days.weekends");
  const names = t("time.weekdaysShort", { returnObjects: true });
  // Monday first, as people list a week.
  return [...days]
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((day) => names[day])
    .join(", ");
}

/** An instant in the phone's time: the time today, a date and time otherwise. */
export function formatWhen(t: TFunction, epochMs: number, now = new Date()): string {
  const date = new Date(epochMs);
  const time = formatClock(date.getHours() * 60 + date.getMinutes());
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  return sameDay ? time : t("scheduled.dateTime", { date: formatMonthDay(t, date), time });
}

/** "Weekdays at 09:00", "Every 2 hours", "Once, Nov 24 at 09:00". */
export function describeSchedule(t: TFunction, schedule: TaskSchedule | null): string {
  if (!schedule) return t("scheduled.kind.other");
  switch (schedule.type) {
    case "at":
      return t("scheduled.describe.once", { when: formatWhen(t, schedule.at) });
    case "every": {
      const every = parseEvery(schedule.every);
      return every
        ? t(`scheduled.describe.every.${every.unit}`, { count: every.count })
        : t("scheduled.describe.everyRaw", { every: schedule.every });
    }
    case "cron": {
      const days = parseDaysCron(schedule.cron);
      return days
        ? t("scheduled.describe.days", {
            days: describeDays(t, days.days),
            time: formatClock(days.time),
          })
        : t("scheduled.describe.cron", { cron: schedule.cron });
    }
  }
}
