import type { Prisma } from "@prisma/client";
/** Same-phase uploads/notes never restart the waiting clock. Re-entry starts a new interval. */
export function phaseTiming(r: {
  workflowVersion: number;
  phase: string | null;
  status: string;
  createdAt: Date;
  events: { payload: Prisma.JsonValue | null; createdAt: Date }[];
}) {
  if (
    r.workflowVersion !== 2 ||
    !["pending_approval", "processing"].includes(r.status)
  )
    return { phaseSince: null, waitingOn: null };
  let since = r.createdAt;
  for (const event of r.events) {
    const p = event.payload as {
      phase?: string;
      previousPhase?: string;
    } | null;
    if (
      p?.phase === r.phase &&
      typeof p.previousPhase === "string" &&
      p.previousPhase !== p.phase &&
      event.createdAt > since
    )
      since = event.createdAt;
  }
  const owner: Record<string, string> = {
    staff_review: "staff",
    student_revision: "student",
    awaiting_signature: "signer",
    student_external: "student",
    ready_registrar: "staff",
    awaiting_result: "registry",
  };
  return {
    phaseSince: since.toISOString(),
    waitingOn: owner[r.phase ?? ""] ?? null,
  };
}
