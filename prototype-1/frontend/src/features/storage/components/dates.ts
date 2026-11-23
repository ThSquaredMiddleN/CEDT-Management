import { useEffect, useState } from "react";

export const DAY_MS = 24 * 60 * 60 * 1000;
/** Due within this many days shows amber. */
export const DUE_SOON_DAYS = 14;

export const formatDateTime = (ms: number) =>
  new Date(ms).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

export const formatDate = (ms: number) => new Date(ms).toLocaleDateString("th-TH", { dateStyle: "medium" });

/** Whole days from `from` to `to`, a part day counted as a day. */
export const daysBetween = (from: number, to: number) => Math.ceil((to - from) / DAY_MS);

/** "23:41:05"; clamps at zero. */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":");
}

/** "4 เดือน" for spans of 60 days or more, otherwise "N วัน". */
export function spanLabel(ms: number): string {
  const days = Math.round(ms / DAY_MS);
  return days >= 60 ? `${Math.round(days / 30)} เดือน` : `${days} วัน`;
}

/** Epoch ms -> value for <input type="datetime-local"> (local time, minutes). */
export function toLocalInput(ms: number): string {
  const offset = new Date(ms).getTimezoneOffset() * 60_000;
  return new Date(ms - offset).toISOString().slice(0, 16);
}

/** <input type="datetime-local"> value -> epoch ms (NaN when empty or invalid). */
export const fromLocalInput = (value: string) => new Date(value).getTime();

export type DueTone = "ok" | "soon" | "late";

export function dueTone(dueAt: number, now: number, notBrought: boolean): DueTone {
  if (notBrought || now > dueAt) return "late";
  return dueAt - now <= DUE_SOON_DAYS * DAY_MS ? "soon" : "ok";
}

/** Current time, refreshed every `intervalMs` (for countdowns and due badges). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
