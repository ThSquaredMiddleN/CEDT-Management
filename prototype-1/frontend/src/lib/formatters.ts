import { format, parseISO } from "date-fns";

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const DAY_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const dayName = (dow: number | null | undefined): string =>
  dow === null || dow === undefined ? "" : (DAY_NAMES[dow] ?? "");

/** "Mon 10:00–12:00" for a recurring booking, "Wed 16 Jul 13:00–15:00" for a one-off. */
export function whenLabel(b: {
  bookingType: "recurring" | "one_off";
  dayOfWeek: number | null;
  oneOffDate: string | null;
  startTime: string;
  endTime: string;
}): string {
  const time = `${b.startTime}–${b.endTime}`;
  if (b.bookingType === "one_off" && b.oneOffDate) {
    return `${format(parseISO(b.oneOffDate), "EEE d MMM")} ${time}`;
  }
  return `${dayName(b.dayOfWeek)} ${time}`;
}

/** "Jul 12, 09:24" — the submitted-at column in the pending queue. */
export const submittedAt = (iso: string): string => format(parseISO(iso), "MMM d, HH:mm");

export const dateLabel = (iso: string): string => format(parseISO(iso), "EEE d MMM yyyy");

/** 30-minute slots across the 07:00–21:00 display window. */
export const TIME_SLOTS: string[] = (() => {
  const out: string[] = [];
  for (let m = 7 * 60; m <= 21 * 60; m += 30) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${m % 60 === 0 ? "00" : "30"}`);
  }
  return out;
})();

export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
