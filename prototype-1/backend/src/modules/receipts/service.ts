import { z } from "zod";
import { config } from "../../config.js";
import { prisma, type Tx } from "../../db.js";
import { can, loadSessionUser, type SessionUser } from "../../core/permissions.js";
import { AppError, conflict, notFound } from "../../lib/errors.js";

/** Receipts are buffered in memory (max 10 MB) and forwarded to the OCR sidecar; nothing is written to disk. */
export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
}

export type Verdict = "ok" | "warn" | "fail";

const DUPLICATE_CHECK = "Not submitted before";
const BELONGS_CHECK = "Belongs to this student";

const sidecarResponse = z.object({
  kind: z.enum(["pdf", "screenshot"]),
  // Each field is {value, box, pii}; only `value` is read here. Names come back to staff, never stored.
  fields: z.record(z.string(), z.object({ value: z.string().nullable() }).passthrough()),
  checks: z.array(
    z.object({
      name: z.string(),
      state: z.enum(["ok", "warn", "fail", "info"]),
      detail: z.string(),
    }),
  ),
});

export type SidecarFields = z.infer<typeof sidecarResponse>["fields"];
export type SidecarCheck = z.infer<typeof sidecarResponse>["checks"][number];

/** Thrown when the sidecar is down or reports 503; the route turns it into the plain 503 body. */
export class OcrUnavailableError extends Error {
  constructor() {
    super("OCR service unavailable");
  }
}

function isTimeout(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name;
  return name === "TimeoutError" || name === "AbortError";
}

/** Upload → sidecar. Never includes the URL, file name or student ID in an error. */
async function askSidecar(
  file: UploadedFile,
  studentId: string,
  term: string,
): Promise<z.infer<typeof sidecarResponse>> {
  const url = new URL("/parse", config.OCR_SERVICE_URL);
  url.searchParams.set("term", term);
  url.searchParams.set("student_id", studentId);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      redirect: "error", // never let the sidecar forward the upload elsewhere
      headers: { "content-type": file.mimetype },
      body: file.buffer,
      signal: AbortSignal.timeout(config.OCR_TIMEOUT_MS),
    });
  } catch (err) {
    if (isTimeout(err)) throw new AppError("GATEWAY_TIMEOUT", "OCR service timed out");
    throw new OcrUnavailableError();
  }

  if (res.status === 503) throw new OcrUnavailableError();
  if (res.status === 413) throw new AppError("PAYLOAD_TOO_LARGE", "Receipt file is over 10 MB");
  if (res.status === 422) {
    throw new AppError("VALIDATION", "Could not read this receipt. Try a clearer screenshot or the PDF.");
  }
  if (res.status === 415) {
    throw new AppError("UNSUPPORTED_MEDIA_TYPE", "Only PDF, JPEG or PNG receipts are accepted");
  }
  if (!res.ok) throw new AppError("BAD_GATEWAY", "OCR service returned an error");

  try {
    const parsed = sidecarResponse.safeParse(await res.json());
    if (parsed.success) return parsed.data;
  } catch (err) {
    if (isTimeout(err)) throw new AppError("GATEWAY_TIMEOUT", "OCR service timed out");
  }
  throw new AppError("BAD_GATEWAY", "OCR service returned an unexpected response");
}

/**
 * The term to check against when the staff member did not give one: the same rule as the
 * sidecar's own default (CU terms in B.E.: 1 = Aug-Dec, 2 = Jan-May, 3 = Jun-Jul), in APP_TZ.
 */
export function currentTerm(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: config.APP_TZ,
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const be = year + 543;
  if (month >= 8) return `1/${be}`;
  if (month <= 5) return `2/${be - 1}`;
  return `3/${be - 1}`;
}

function fieldValue(fields: SidecarFields, key: string): string | null {
  const value = fields[key]?.value;
  return value ? value : null;
}

/** Sidecar field names → columns. `reference` is the screenshot's, `receipt_no` the PDF's. */
export function columnsFrom(fields: SidecarFields) {
  return {
    // whitespace-free, so an OCR'd "1234 5678" still matches "12345678" in the duplicate check
    reference: (fieldValue(fields, "reference") ?? fieldValue(fields, "receipt_no"))?.replace(/\s+/g, "") || null,
    amount: fieldValue(fields, "amount"),
    paymentStatus: fieldValue(fields, "status"),
    paidAt: fieldValue(fields, "paid_at"),
    funding: fieldValue(fields, "funding"),
  };
}

/**
 * Replaces the sidecar's "Not submitted before" check (it only sees this one upload) with the
 * database answer. With no reference there is nothing to compare, so the checks are left as they are.
 */
export function applyReferenceCheck(
  checks: SidecarCheck[],
  reference: string | null,
  dup: { studentId: string; term: string; settled: boolean } | null,
): SidecarCheck[] {
  if (!reference) return checks;
  // Only a settled row (passed, or checked by staff) makes this a duplicate. An unchecked student upload can be
  // someone else's screenshot (the "Belongs" check only saw an ID prefix), so staff decide between the two.
  const check: SidecarCheck = !dup
    ? { name: DUPLICATE_CHECK, state: "ok", detail: "reference not used in any other check" }
    : dup.settled
      ? {
          name: DUPLICATE_CHECK,
          state: "fail",
          detail: `reference already used for student ${dup.studentId}, term ${dup.term}`,
        }
      : {
          name: DUPLICATE_CHECK,
          state: "warn",
          detail: `same reference as another unchecked upload (student ${dup.studentId}, term ${dup.term}); staff to decide`,
        };
  const i = checks.findIndex((c) => c.name === DUPLICATE_CHECK);
  if (i === -1) return [...checks, check];
  return checks.map((c, j) => (j === i ? check : c));
}

export function verdictOf(checks: { state: string }[]): Verdict {
  if (checks.some((c) => c.state === "fail")) return "fail";
  if (checks.some((c) => c.state === "warn")) return "warn";
  return "ok";
}

export interface CheckInput {
  studentId: string;
  term?: string;
  file: UploadedFile;
  checkedById: string;
  /** True for a student's own upload: the save is refused (409) if the term's row got locked meanwhile. */
  selfService?: boolean;
}

export const RECEIPT_LOCKED_MESSAGE = "This term's receipt is already checked. Ask staff to change it.";

/** Runs one receipt through the sidecar, records the check (one row per student and term) and returns the fields for display. */
export async function checkReceipt(input: CheckInput) {
  const term = input.term ?? currentTerm();
  const sidecar = await askSidecar(input.file, input.studentId, term);

  const columns = columnsFrom(sidecar.fields);
  const reference = columns.reference;

  // The duplicate lookup and the save. A re-check replaces the earlier row, so it starts a new retention clock.
  const save = async (db: Tx) => {
    // Other rows with this reference, newest first. A settled one wins, so a pending upload never hides a real duplicate.
    const others = reference
      ? await db.receiptCheck.findMany({
          where: { reference, NOT: { studentId: input.studentId, term } },
          select: {
            studentId: true,
            term: true,
            verdict: true,
            checkedById: true,
            checkedBy: { select: { studentNo: true } },
          },
          orderBy: { createdAt: "desc" },
        })
      : [];
    const withSettled = others.map((r) => ({
      studentId: r.studentId,
      term: r.term,
      // Same rule as studentLocked, from the row student's side: their own check is the one whose checker has their number.
      settled: studentLocked(r, r.checkedBy.studentNo === r.studentId ? r.checkedById : ""),
    }));
    const dup = withSettled.find((r) => r.settled) ?? withSettled[0] ?? null;

    const checks = applyReferenceCheck(sidecar.checks, reference, dup);
    // A receipt that isn't this student's must not claim its reference: otherwise anyone who uploads a classmate's
    // screenshot makes the classmate's own upload fail "Not submitted before".
    const notTheirs = checks.some((c) => c.name === BELONGS_CHECK && c.state === "fail");
    const data = {
      kind: sidecar.kind,
      ...columns,
      ...(notTheirs ? { reference: null } : {}),
      checks,
      verdict: verdictOf(checks),
      checkedById: input.checkedById,
    };

    return db.receiptCheck.upsert({
      where: { studentId_term: { studentId: input.studentId, term } },
      create: { studentId: input.studentId, term, ...data },
      update: { ...data, createdAt: new Date() },
    });
  };

  // The lookup and the save run in one transaction holding advisory locks. Always taken in this order, so two
  // transactions cannot wait on each other:
  //  1. studentId|term: the OCR call took a while, so the term's row may have changed since the route's early check.
  //     A student's upload re-reads the row here and is refused if it is now locked; staff are never refused.
  //  2. the reference (when there is one): two concurrent checks with the same reference cannot both read
  //     "no duplicate" before either one saves.
  const check = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`receipt-term|${input.studentId}|${term}`}))`;
    if (input.selfService) {
      const current = await tx.receiptCheck.findUnique({
        where: { studentId_term: { studentId: input.studentId, term } },
      });
      if (studentLocked(current, input.checkedById)) throw conflict(RECEIPT_LOCKED_MESSAGE);
    }
    if (reference) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${reference}))`;
    return save(tx);
  });

  return { check, fields: sidecar.fields };
}

export async function listReceiptChecks(filter: { term?: string; verdict?: Verdict }) {
  return prisma.receiptCheck.findMany({
    where: {
      ...(filter.term ? { term: filter.term } : {}),
      ...(filter.verdict ? { verdict: filter.verdict } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

/**
 * What a student sees of a check. Only name and state of each check: the `detail` text can name another
 * student's ID (the duplicate check), and the OCR fields carry the student's own name. Neither is returned.
 */
export function studentView(
  row: {
    id: string;
    term: string;
    kind: string;
    verdict: string;
    createdAt: Date;
    checks: unknown;
    checkedById: string | null;
  },
  viewerId: string,
) {
  // The Funding row is a staff note (กยศ. hints, English, sometimes "unreadable"): it never changes the verdict.
  // It is hidden by the allowlist below, like any other name that is not on it.
  const checks = (row.checks as { name: string; state: string }[]).filter((c) => STUDENT_VISIBLE_CHECKS.has(c.name));
  return {
    id: row.id,
    term: row.term,
    kind: row.kind,
    verdict: row.verdict,
    createdAt: row.createdAt,
    checks: checks.map((c) => ({ name: c.name, state: c.state })),
    // The same test studentLocked uses: a check run by someone else is a staff check. Only a yes/no, never who.
    staffChecked: row.checkedById !== viewerId,
  };
}

/**
 * The check names a student may see (the ones the frontend has Thai labels for). Anything else, such as the staff-only
 * Funding note or a check the sidecar adds later, stays hidden until it is added here.
 */
const STUDENT_VISIBLE_CHECKS: ReadonlySet<string> = new Set([
  "All key fields read",
  "Payment completed",
  "Current semester",
  BELONGS_CHECK,
  DUPLICATE_CHECK,
]);

/**
 * A student may replace their own check for a term only while it is unsettled: not passed, and not run by staff.
 * Staff can always check again.
 */
export function studentLocked(row: { verdict: string; checkedById: string | null } | null, viewerId: string): boolean {
  if (!row) return false;
  return row.verdict === "ok" || row.checkedById !== viewerId;
}

export async function ownCheckForTerm(studentId: string, term: string) {
  return prisma.receiptCheck.findUnique({ where: { studentId_term: { studentId, term } } });
}

/** The student's own checks, all terms, newest first. */
export async function listOwnReceiptChecks(studentId: string) {
  return prisma.receiptCheck.findMany({
    where: { studentId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

export async function deleteReceiptCheck(id: string): Promise<void> {
  const { count } = await prisma.receiptCheck.deleteMany({ where: { id } });
  if (count === 0) throw notFound("Receipt check not found");
}

const VERDICT_TH: Record<string, string> = { ok: "ผ่าน", warn: "รอเจ้าหน้าที่ตรวจ", fail: "ไม่ผ่าน" };
const LOCKED_NOTE = "หากต้องการเปลี่ยน กรุณาติดต่อเจ้าหน้าที่";

/** The receipt feature is for accounts with a student number and `receipts.use` (the same rule as /receipts/mine). */
export const canUseReceipts = (me: SessionUser): boolean => me.studentNo !== null && can(me, "receipts.use");

/** A summary for the user, or why there is none, so the bot can say the right thing. */
export type LineSummary = { text: string; link: string } | { reason: "not-student" | "no-permission" };

/**
 * A short status for the LINE bot ("ใบเสร็จ"), and the pattern for other modules' LINE summaries: one exported
 * function in the module's service that takes a user ID, applies the module's own permission and rules, and returns
 * `{ text, link }`, or `{ reason }` when the user has nothing to ask here. The bot adds the app origin to `link`.
 *
 * Same lookups and rules as GET /receipts/mine: the user's own student number, the current term, `studentView`
 * for what may be shown, `studentLocked` for whether they can send again. The text is built only from the verdict
 * and who checked it: never a reference, amount, name, ID, check detail or another student's row.
 * `no-permission`: unknown or inactive account, or no `receipts.use`. `not-student`: no student number.
 */
export async function lineSummary(userId: string): Promise<LineSummary> {
  const me = await loadSessionUser(userId);
  if (!me) return { reason: "no-permission" };
  if (me.studentNo === null) return { reason: "not-student" };
  if (!canUseReceipts(me)) return { reason: "no-permission" };

  const link = "/receipts";
  const row = await ownCheckForTerm(me.studentNo, currentTerm());
  if (!row) return { text: "ยังไม่ได้ส่งใบเสร็จภาคการศึกษานี้", link };

  const { verdict } = studentView(row);
  // The same test studentLocked uses: a check run by someone else is a staff check.
  const staffChecked = row.checkedById !== me.id;
  // A warn that staff already looked at is not "waiting for staff" any more.
  const label = staffChecked && verdict === "warn" ? "เจ้าหน้าที่ตรวจแล้ว มีข้อสังเกต" : (VERDICT_TH[verdict] ?? "รอเจ้าหน้าที่ตรวจ");
  // Locked (passed, or checked by staff): no resend, as on the web page. Otherwise the student may send again.
  const second = studentLocked(row, me.id)
    ? `${staffChecked ? "เจ้าหน้าที่ตรวจแล้ว" : "ระบบตรวจให้อัตโนมัติ"} ${LOCKED_NOTE}`
    : "ยังไม่มีเจ้าหน้าที่ตรวจ ส่งใหม่ได้ที่หน้าเว็บ";
  return { text: `ใบเสร็จภาคการศึกษานี้: ${label}\n${second}`, link };
}
