import type {
  CourseChangeEventType,
  CourseChangeFlow,
  CourseChangeStatus,
  CourseChangeType,
} from "@prisma/client";
import { addDaysISO, dateFromISO } from "../../lib/time.js";

/**
 * Smart Timeline Detection (DESIGN.md §3). Pure functions — no DB, no clock — so the routing
 * matrix is unit-testable at every week boundary.
 */

/** The last teaching week any window may reference (term + exam weeks). */
export const MAX_WEEK = 18;

export interface WindowRule {
  requestType: CourseChangeType;
  weekFrom: number;
  weekTo: number;
  flow: CourseChangeFlow;
}

/** 1-based teaching week of `today` in a term opening on `termStart`; 0 before it opens. */
export function weekOf(termStart: string, today: string): number {
  const days = Math.round(
    (dateFromISO(today).getTime() - dateFromISO(termStart).getTime()) / 86_400_000,
  );
  return days < 0 ? 0 : Math.floor(days / 7) + 1;
}

/** First day (Monday, when the term opens on a Monday) of `week`. */
export const weekStartDate = (termStart: string, week: number): string =>
  addDaysISO(termStart, (week - 1) * 7);

/** Last day (Sunday) of `week` — the "ยื่นได้ถึง" deadline when it ends a window. */
export const weekEndDate = (termStart: string, week: number): string =>
  addDaysISO(termStart, week * 7 - 1);

/** The window that routes a request of `type` submitted in `week`, or null when closed (CC-BR-4). */
export function resolveWindow<W extends WindowRule>(
  windows: W[],
  type: CourseChangeType,
  week: number,
): W | null {
  return (
    windows.find((w) => w.requestType === type && week >= w.weekFrom && week <= w.weekTo) ?? null
  );
}

/** The next window of `type` that opens after `week`, for the "opens on …" hint. */
export function nextWindow<W extends WindowRule>(
  windows: W[],
  type: CourseChangeType,
  week: number,
): W | null {
  return (
    windows
      .filter((w) => w.requestType === type && w.weekFrom > week)
      .sort((a, b) => a.weekFrom - b.weekFrom)[0] ?? null
  );
}

// ------------------------------------------------------------------- flow steps

export type StepKey = Extract<
  CourseChangeEventType,
  | "submitted"
  | "approved"
  | "document_generated"
  | "sent_to_reg_chula"
  | "sent_to_pi"
  | "forwarded_to_registrar"
  | "completed"
>;

/** What each flow does, in order. Each step is "done" once its audit event exists. */
export const FLOW_STEPS: Record<CourseChangeFlow, { key: StepKey; label: string }[]> = {
  reg_direct: [
    { key: "submitted", label: "ยื่นคำร้อง" },
    { key: "sent_to_reg_chula", label: "จำลองส่งเข้า Reg Chula" },
    { key: "completed", label: "ทะเบียนยืนยันผล" },
  ],
  advisor_pi: [
    { key: "submitted", label: "ยื่นคำร้อง" },
    { key: "approved", label: "อาจารย์ที่ปรึกษาอนุมัติ" },
    { key: "document_generated", label: "จัดเตรียมเอกสารคำร้องตัวอย่าง" },
    { key: "sent_to_pi", label: "จำลองส่ง Reg Chula + ระบบ PI" },
    { key: "completed", label: "ทะเบียนยืนยันผล" },
  ],
  program_registrar: [
    { key: "submitted", label: "ยื่นคำร้อง" },
    { key: "approved", label: "หลักสูตรอนุมัติ" },
    { key: "forwarded_to_registrar", label: "บันทึกขั้นตอนส่ง สนท. (จำลอง)" },
    { key: "completed", label: "สนท. แจ้งผล" },
  ],
};

export type StepState = "done" | "current" | "halted" | "upcoming";

export interface StepView {
  key: StepKey;
  label: string;
  state: StepState;
  at: string | null;
}

/**
 * Overlay the audit log on the flow's step list: the first unfinished step is "current", or
 * "halted" when the request was rejected / cancelled before reaching it.
 */
export function stepStates(
  flow: CourseChangeFlow,
  status: CourseChangeStatus,
  events: { eventType: CourseChangeEventType; createdAt: Date }[],
): StepView[] {
  const firstAt = new Map<CourseChangeEventType, Date>();
  for (const e of events) if (!firstAt.has(e.eventType)) firstAt.set(e.eventType, e.createdAt);

  const halted = status === "rejected" || status === "cancelled";
  let reachedOpenStep = false;

  return FLOW_STEPS[flow].map((step) => {
    const at = firstAt.get(step.key);
    if (at) return { ...step, state: "done", at: at.toISOString() };
    if (reachedOpenStep) return { ...step, state: "upcoming", at: null };
    reachedOpenStep = true;
    return { ...step, state: halted ? "halted" : "current", at: null };
  });
}
