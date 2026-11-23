import { describe, it, expect } from "vitest";
import { phaseTiming } from "../src/modules/course-change/queue.js";
const createdAt = new Date("2026-09-01T00:00:00Z");
const base = {
  workflowVersion: 2,
  status: "processing",
  phase: "awaiting_signature",
  createdAt,
  events: [],
};
describe("time spent in a workflow phase", () => {
  it("starts at phase entry, ignoring later uploads and same-phase notes", () => {
    const entry = new Date("2026-09-02T00:00:00Z");
    const r = {
      ...base,
      events: [
        {
          createdAt: entry,
          payload: {
            phase: "awaiting_signature",
            previousPhase: "staff_review",
          },
        },
        {
          createdAt: new Date("2026-09-03"),
          payload: { phase: "awaiting_signature", action: "file_uploaded" },
        },
        {
          createdAt: new Date("2026-09-04"),
          payload: {
            phase: "awaiting_signature",
            previousPhase: "awaiting_signature",
            action: "signature_sent",
          },
        },
      ],
    };
    expect(phaseTiming(r)).toEqual({
      phaseSince: entry.toISOString(),
      waitingOn: "signer",
    });
  });
  it("restarts only on re-entry after document correction", () => {
    expect(
      phaseTiming({
        ...base,
        phase: "student_external",
        events: [
          {
            createdAt: new Date("2026-09-02"),
            payload: {
              phase: "student_external",
              previousPhase: "awaiting_signature",
            },
          },
          {
            createdAt: new Date("2026-09-05"),
            payload: {
              phase: "student_external",
              previousPhase: "awaiting_result",
              action: "request_documents",
            },
          },
        ],
      }).phaseSince,
    ).toBe("2026-09-05T00:00:00.000Z");
  });
  it("uses submission as the fallback and assigns the next responsible party", () => {
    expect(phaseTiming({ ...base, phase: "student_revision" })).toEqual({
      phaseSince: createdAt.toISOString(),
      waitingOn: "student",
    });
  });
  it("does not show an open waiting clock on historical or closed requests", () => {
    expect(phaseTiming({ ...base, status: "completed" })).toEqual({
      phaseSince: null,
      waitingOn: null,
    });
    expect(phaseTiming({ ...base, workflowVersion: 1 })).toEqual({
      phaseSince: null,
      waitingOn: null,
    });
  });
});
