import { config } from "../config.js";

/**
 * Date/time handling (§8.2). The system is single-timezone (Asia/Bangkok, no DST).
 * DATE and TIME columns hold timezone-naive Bangkok wall-clock values; we move them
 * across the Prisma boundary as UTC-midnight Dates / 1970-01-01 times and format them
 * back to "YYYY-MM-DD" / "HH:MM" strings explicitly in the serializers.
 */

export const DAY_START_MIN = 7 * 60; // 07:00
export const DAY_END_MIN = 21 * 60; // 21:00

/** "YYYY-MM-DD" -> Date at UTC midnight (what Prisma expects for @db.Date). */
export function dateFromISO(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Prisma @db.Date value -> "YYYY-MM-DD". */
export function isoDate(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/** "HH:MM" -> Date (1970-01-01T HH:MM:00Z) for a @db.Time column. */
export function timeFromHHMM(t: string): Date {
  return new Date(`1970-01-01T${t}:00.000Z`);
}

/** Prisma @db.Time value -> "HH:MM". */
export function hhmm(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 5);
  return d.toISOString().slice(11, 16);
}

export function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** BR-17: 30-minute grid, inside the 07:00-21:00 window. */
export function isOnGrid(t: string): boolean {
  const m = timeToMin(t) % 30;
  return m === 0;
}

export function isInWindow(t: string): boolean {
  const m = timeToMin(t);
  return m >= DAY_START_MIN && m <= DAY_END_MIN;
}

/** 0 = Sunday ... 6 = Saturday (Postgres dow / JS getDay). */
export function dayOfWeekOf(iso: string): number {
  return dateFromISO(iso).getUTCDay();
}

export function addDaysISO(iso: string, days: number): string {
  const d = dateFromISO(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

/** "Today" in Asia/Bangkok, as YYYY-MM-DD (BR-13, series moves). */
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: config.APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const dayName = (dow: number): string => DAY_NAMES[dow] ?? "?";

/** Human phrase used in notification messages: "Mon" (recurring) or "2026-08-19" (one-off). */
export function dayOrDate(dow: number | null, oneOff: string | null): string {
  if (dow !== null && dow !== undefined) return dayName(dow);
  return oneOff ?? "";
}
