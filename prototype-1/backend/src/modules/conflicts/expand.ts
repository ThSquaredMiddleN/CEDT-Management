import { validation } from "../../lib/errors.js";
import { addDaysISO, dayOfWeekOf } from "../../lib/time.js";

export interface Candidate {
  roomId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
}

export interface ExpandInput {
  bookingType: "recurring" | "one_off";
  roomId: string;
  startTime: string;
  endTime: string;
  dayOfWeek?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  oneOffDate?: string | null;
}

/**
 * BR-4/BR-5: expand a booking definition into concrete occurrence dates.
 * Weekly-on-one-weekday over an inclusive date range, or a single one-off date.
 * Weekday convention: 0 = Sunday ... 6 = Saturday.
 */
export function expandOccurrences(input: ExpandInput): Candidate[] {
  const { roomId, startTime, endTime } = input;

  if (input.bookingType === "one_off") {
    if (!input.oneOffDate) throw validation("oneOffDate is required for a one-off booking");
    return [{ roomId, date: input.oneOffDate, startTime, endTime }];
  }

  const { dayOfWeek, startDate, endDate } = input;
  if (dayOfWeek === null || dayOfWeek === undefined || !startDate || !endDate) {
    throw validation("dayOfWeek, startDate and endDate are required for a recurring booking");
  }

  const out: Candidate[] = [];
  let d = startDate;
  // Walk forward to the first matching weekday, then step a week at a time.
  let guard = 0;
  while (dayOfWeekOf(d) !== dayOfWeek && d <= endDate && guard++ < 7) {
    d = addDaysISO(d, 1);
  }
  while (d <= endDate) {
    out.push({ roomId, date: d, startTime, endTime });
    d = addDaysISO(d, 7);
  }

  if (out.length === 0) {
    throw validation("The date range contains no matching weekday", [
      { field: "startDate", message: "date range contains no matching weekday" },
    ]);
  }
  return out;
}
