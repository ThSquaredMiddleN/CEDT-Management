import { describe, expect, it } from "vitest";
import {
  resolveWindow,
  stepStates,
  weekEndDate,
  weekOf,
  type WindowRule,
} from "../src/modules/course-change/timeline.js";

/** Pure unit tests for Smart Timeline Detection (DESIGN.md §3) — no DB needed. */

const MATRIX: WindowRule[] = [
  { requestType: "drop", weekFrom: 1, weekTo: 6, flow: "reg_direct" },
  { requestType: "drop", weekFrom: 7, weekTo: 18, flow: "program_registrar" },
  { requestType: "withdraw", weekFrom: 3, weekTo: 6, flow: "reg_direct" },
  { requestType: "withdraw", weekFrom: 7, weekTo: 12, flow: "advisor_pi" },
  { requestType: "withdraw", weekFrom: 13, weekTo: 18, flow: "program_registrar" },
];

describe("weekOf", () => {
  const start = "2026-08-03"; // Monday

  it("is 0 before the term opens", () => {
    expect(weekOf(start, "2026-08-02")).toBe(0);
  });

  it("counts Monday–Sunday blocks from the opening day", () => {
    expect(weekOf(start, "2026-08-03")).toBe(1);
    expect(weekOf(start, "2026-08-09")).toBe(1);
    expect(weekOf(start, "2026-08-10")).toBe(2);
    expect(weekOf(start, "2026-09-30")).toBe(9);
  });

  it("puts the deadline on the Sunday that ends the window", () => {
    expect(weekEndDate(start, 6)).toBe("2026-09-13");
    expect(weekEndDate(start, 12)).toBe("2026-10-25");
  });
});

describe("resolveWindow — routing matrix boundaries", () => {
  const flow = (type: "drop" | "withdraw", week: number) =>
    resolveWindow(MATRIX, type, week)?.flow ?? "closed";

  it.each([
    [0, "closed"],
    [1, "reg_direct"],
    [6, "reg_direct"],
    [7, "program_registrar"],
    [18, "program_registrar"],
    [19, "closed"],
  ])("drop in week %i → %s", (week, expected) => {
    expect(flow("drop", week)).toBe(expected);
  });

  it.each([
    [1, "closed"],
    [2, "closed"],
    [3, "reg_direct"],
    [6, "reg_direct"],
    [7, "advisor_pi"],
    [12, "advisor_pi"],
    [13, "program_registrar"],
    [18, "program_registrar"],
    [19, "closed"],
  ])("withdraw in week %i → %s", (week, expected) => {
    expect(flow("withdraw", week)).toBe(expected);
  });
});

describe("stepStates", () => {
  const t = new Date("2026-09-30T03:00:00Z");

  it("marks the first unfinished step current", () => {
    const steps = stepStates("advisor_pi", "pending_approval", [
      { eventType: "submitted", createdAt: t },
    ]);
    expect(steps.map((s) => s.state)).toEqual(["done", "current", "upcoming", "upcoming", "upcoming"]);
  });

  it("marks it halted once the request is rejected", () => {
    const steps = stepStates("program_registrar", "rejected", [
      { eventType: "submitted", createdAt: t },
      { eventType: "rejected", createdAt: t },
    ]);
    expect(steps.map((s) => s.state)).toEqual(["done", "halted", "upcoming", "upcoming"]);
  });
});
