import { useEffect, useRef, useState } from "react";
import { checkConflicts } from "@/api/endpoints";
import type { BookingInput, CheckConflictsResponse } from "@/api/types";

export type ConflictState = "idle" | "debouncing" | "checking" | "clear" | "blocked" | "error";

/** The subset of form fields that actually affect availability (§7b). */
export interface ConflictInput {
  termId: string;
  bookingType: "recurring" | "one_off";
  dayOfWeek: string;
  startDate: string;
  endDate: string;
  oneOffDate: string;
  startTime: string;
  endTime: string;
  roomId: string;
  studentCount: number;
  courseId: string | null;
  instructorId: string;
}

/** Is the availability-relevant subset complete and internally consistent? */
function isCheckable(v: ConflictInput): boolean {
  if (!v.termId || !v.roomId || !v.instructorId) return false;
  if (!v.startTime || !v.endTime || v.endTime <= v.startTime) return false;

  if (v.bookingType === "recurring") {
    if (v.dayOfWeek === "" || !v.startDate || !v.endDate) return false;
    if (v.endDate < v.startDate) return false;
  } else if (!v.oneOffDate) {
    return false;
  }
  return true;
}

const DEBOUNCE_MS = 400;

/**
 * Real-time conflict check (§7b). Debounces the watched values, cancels in-flight requests,
 * and discards out-of-order responses via a sequence counter, so the banner can never show
 * a stale verdict.
 */
export function useConflictCheck(values: ConflictInput, excludeBookingId?: string | null) {
  const [state, setState] = useState<ConflictState>("idle");
  const [result, setResult] = useState<CheckConflictsResponse | null>(null);

  const seq = useRef(0);
  const abort = useRef<AbortController | null>(null);

  // Values are compared structurally so a re-render with equal values doesn't re-trigger.
  const key = JSON.stringify(values);

  useEffect(() => {
    const v: ConflictInput = JSON.parse(key);

    abort.current?.abort();
    const mySeq = ++seq.current;

    if (!isCheckable(v)) {
      setState("idle");
      setResult(null);
      return;
    }

    setState("debouncing");

    const timer = setTimeout(async () => {
      const controller = new AbortController();
      abort.current = controller;
      setState("checking");

      const payload: BookingInput = {
        bookingType: v.bookingType,
        termId: v.termId,
        courseId: v.courseId,
        // Course-less "Other" bookings still need a title for the API contract.
        title: v.courseId ? null : "Booking",
        instructorId: v.instructorId,
        roomId: v.roomId,
        dayOfWeek: v.bookingType === "recurring" ? Number(v.dayOfWeek) : null,
        startDate: v.bookingType === "recurring" ? v.startDate : null,
        endDate: v.bookingType === "recurring" ? v.endDate : null,
        oneOffDate: v.bookingType === "one_off" ? v.oneOffDate : null,
        startTime: v.startTime,
        endTime: v.endTime,
        studentCount: v.studentCount > 0 ? v.studentCount : 1,
        excludeBookingId: excludeBookingId ?? null,
      };

      try {
        const res = await checkConflicts(payload, controller.signal);
        if (mySeq !== seq.current) return; // a newer check already superseded this one
        setResult(res);
        setState(res.hasBlockingConflicts ? "blocked" : "clear");
      } catch (e) {
        if (controller.signal.aborted || mySeq !== seq.current) return;
        setResult(null);
        setState("error");
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [key, excludeBookingId]);

  /** Feed a 409 from the submit call into the same banner renderer. */
  const setBlockedFromSubmit = (conflicts: CheckConflictsResponse["conflicts"]) => {
    seq.current++; // invalidate anything in flight
    setResult((prev) => ({
      hasBlockingConflicts: true,
      conflicts,
      pendingOverlaps: prev?.pendingOverlaps ?? [],
      capacityWarning: prev?.capacityWarning ?? null,
      alternativeRooms: prev?.alternativeRooms ?? [],
    }));
    setState("blocked");
  };

  return { state, result, setBlockedFromSubmit };
}
