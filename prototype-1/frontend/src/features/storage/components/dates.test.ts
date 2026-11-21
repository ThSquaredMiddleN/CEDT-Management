import { describe, expect, it } from "vitest";
import { DAY_MS, daysBetween, dueTone, formatCountdown, fromLocalInput, spanLabel, toLocalInput } from "./dates";

describe("date helpers", () => {
  it("formats a countdown as hh:mm:ss and never goes negative", () => {
    expect(formatCountdown(23 * 3600_000 + 41 * 60_000 + 5_000)).toBe("23:41:05");
    expect(formatCountdown(-5_000)).toBe("00:00:00");
  });

  it("counts days left, rounding a part day up", () => {
    expect(daysBetween(0, DAY_MS / 2)).toBe(1);
    expect(daysBetween(0, 131 * DAY_MS)).toBe(131);
  });

  it("round-trips a datetime-local value", () => {
    const ms = fromLocalInput("2027-03-31T17:00");
    expect(toLocalInput(ms)).toBe("2027-03-31T17:00");
  });

  it("picks the due tone: late when overdue or not brought, soon within 14 days, ok after", () => {
    const now = 1_000 * DAY_MS;
    expect(dueTone(now - 1, now, false)).toBe("late");
    expect(dueTone(now + 30 * DAY_MS, now, true)).toBe("late");
    expect(dueTone(now + 14 * DAY_MS, now, false)).toBe("soon");
    expect(dueTone(now + 15 * DAY_MS, now, false)).toBe("ok");
  });

  it("describes a span in months when long, days when short", () => {
    expect(spanLabel(120 * DAY_MS)).toBe("4 เดือน");
    expect(spanLabel(10 * DAY_MS)).toBe("10 วัน");
  });
});
