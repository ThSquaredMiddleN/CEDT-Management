import { Prisma } from "@prisma/client";
import { z } from "zod";
import { config } from "../../config.js";
import { audit } from "../../core/audit.js";
import { deleteFileRecord, readFile, withFileTransaction, type FileWriter } from "../../core/files.js";
import { prisma, type Tx } from "../../db.js";
import { can, loadSessionUser, type SessionUser } from "../../core/permissions.js";
import { AppError, conflict, notFound } from "../../lib/errors.js";

/** Receipts are buffered in memory (max 10 MB) and forwarded to the OCR sidecar. Only its JPEG copy is stored (see checkReceipt). */
export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
}

export type Verdict = "ok" | "warn" | "fail";

const DUPLICATE_CHECK = "Not submitted before";
const BELONGS_CHECK = "Belongs to this student";

const sidecarResponse = z.object({
  kind: z.enum(["pdf", "screenshot"]),
  // Each field is {value, box, pii}; only `value` is read here. The name is stored only on warn rows (`ocrName`).
  fields: z.record(z.string(), z.object({ value: z.string().nullable() }).passthrough()),
  // A JPEG copy of the receipt (a PDF's first page, or the screenshot) for staff to look at. Older sidecars omit it.
  stored_copy: z.object({ mime: z.literal("image/jpeg"), data: z.string() }).nullable().optional(),
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
  const save = async (db: Tx, files: FileWriter) => {
    // Other rows with this reference, newest first. A settled one wins, so a pending upload never hides a real duplicate.
    const others = reference
      ? await db.receiptCheck.findMany({
          where: { reference, NOT: { studentId: input.studentId, term } },
          select: {
            studentId: true,
            term: true,
            verdict: true,
            checkedById: true,
            settlement: true,
            checkedBy: { select: { studentNo: true } },
          },
          orderBy: { createdAt: "desc" },
        })
      : [];
    // A row staff rejected (settled Fail) no longer holds its reference: the real owner's upload must not be flagged against it.
    const withSettled = others.filter((r) => r.settlement !== "fail").map((r) => ({
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
    const verdict = verdictOf(checks);

    // The stored copy (for staff to look at) is kept for a warn, and for every verdict while RECEIPT_KEEP_ALL_FILES is on.
    // A re-check replaces the earlier row, so its old file goes too (bytes removed after the commit).
    const old = await db.receiptCheck.findUnique({
      where: { studentId_term: { studentId: input.studentId, term } },
      select: { fileId: true },
    });
    if (old?.fileId) {
      const staleKey = await deleteCheckFileRecord(db, old.fileId);
      if (staleKey) staleKeys.push(staleKey);
    }
    const copy = sidecar.stored_copy ? Buffer.from(sidecar.stored_copy.data, "base64") : null;
    const fileId =
      copy && copy.length > 0 && (verdict === "warn" || config.RECEIPT_KEEP_ALL_FILES)
        ? (
            await files.save({
              buffer: copy,
              mime: "image/jpeg",
              originalName: `receipt-${term.replace("/", "-")}.jpg`, // never the student's ID or name
              module: "receipts",
              uploadedBy: input.checkedById,
            })
          ).id
        : null;

    const data = {
      kind: sidecar.kind,
      ...columns,
      ...(notTheirs ? { reference: null } : {}),
      checks,
      verdict,
      checkedById: input.checkedById,
      fileId,
      // The name is kept only while staff still have to decide on a warn.
      ocrName: verdict === "warn" ? fieldValue(sidecar.fields, "name") : null,
      settlement: null,
      settleNote: null,
      settledById: null,
      settledAt: null,
    };

    return db.receiptCheck.upsert({
      where: { studentId_term: { studentId: input.studentId, term } },
      create: { studentId: input.studentId, term, ...data },
      update: { ...data, createdAt: new Date() },
    });
  };
  const staleKeys: string[] = [];

  // The lookup and the save run in one transaction holding advisory locks. Always taken in this order, so two
  // transactions cannot wait on each other:
  //  1. studentId|term: the OCR call took a while, so the term's row may have changed since the route's early check.
  //     A student's upload re-reads the row here and is refused if it is now locked; staff are never refused.
  //  2. the reference (when there is one): two concurrent checks with the same reference cannot both read
  //     "no duplicate" before either one saves.
  // withFileTransaction is a prisma.$transaction that also removes a newly stored copy if the transaction rolls back.
  const check = await withFileTransaction(async (tx, files) => {
    staleKeys.length = 0; // a retried transaction starts clean
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`receipt-term|${input.studentId}|${term}`}))`;
    if (input.selfService) {
      const current = await tx.receiptCheck.findUnique({
        where: { studentId_term: { studentId: input.studentId, term } },
      });
      if (studentLocked(current, input.checkedById)) throw conflict(RECEIPT_LOCKED_MESSAGE);
    }
    if (reference) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${reference}))`;
    return save(tx, files);
  });

  // `staleKeys`: contents of a replaced row's file. The route removes them (the row is already gone from `files`).
  return { check, fields: sidecar.fields, staleKeys };
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

type ReceiptRow = NonNullable<Awaited<ReturnType<typeof ownCheckForTerm>>>;

/**
 * The staff-facing row: every column except `fileId` (replaced by `hasFile`; the file is fetched by check id) and
 * `ocrName` (the name on the receipt) and `settleNote` (the staff note), each only for viewers who can manage
 * receipts (`canSeeName` / `canSeeNote`). Adds the display names of whoever checked and settled it. Never goes to students.
 */
export async function staffRowViews(rows: ReceiptRow[], opts: { canSeeName: boolean; canSeeNote: boolean }) {
  const ids = [...new Set(rows.flatMap((r) => [r.checkedById, r.settledById]).filter((x): x is string => !!x))];
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : [];
  const names = new Map(users.map((u) => [u.id, u.name]));
  return rows.map(({ fileId, ocrName, settleNote, ...row }) => ({
    ...row,
    hasFile: fileId !== null,
    ocrName: opts.canSeeName ? ocrName : null,
    settleNote: opts.canSeeNote ? settleNote : null,
    checkedByName: names.get(row.checkedById) ?? null,
    settledByName: row.settledById ? (names.get(row.settledById) ?? null) : null,
  }));
}

export const settleSchema = z.object({
  decision: z.enum(["pass", "fail"]),
  note: z.string().trim().max(300).default(""),
});

/**
 * Staff decide on a check that warned. Pass makes the verdict ok (the student is locked); Fail makes it fail and
 * unlocks the student to upload again. The file and the OCR'd name are dropped either way. Returns the row and the
 * storage key to remove after the commit.
 */
export async function settleReceiptCheck(id: string, input: z.infer<typeof settleSchema>, actorId: string) {
  if (input.decision === "fail" && input.note === "") {
    throw new AppError("BAD_REQUEST", "A note is required when failing a receipt", [
      { field: "note", message: "required for a fail" },
    ]);
  }
  return prisma.$transaction(async (tx) => {
    const found = await tx.receiptCheck.findUnique({ where: { id }, select: { studentId: true, term: true } });
    if (!found) throw notFound("Receipt check not found");
    // The same per-term lock as checkReceipt, so a settle and a re-check of this row cannot interleave.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`receipt-term|${found.studentId}|${found.term}`}))`;
    const row = await tx.receiptCheck.findUnique({ where: { id } });
    if (!row) throw notFound("Receipt check not found");
    if (row.verdict !== "warn" || row.settlement) throw conflict("Only a receipt check that warned and is not yet settled can be settled");

    const verdict: Verdict = input.decision === "pass" ? "ok" : "fail";
    const storageKey = row.fileId ? await deleteCheckFileRecord(tx, row.fileId) : null;
    const updated = await tx.receiptCheck.update({
      where: { id },
      data: {
        verdict,
        settlement: input.decision,
        settleNote: input.note === "" ? null : input.note,
        settledById: actorId,
        settledAt: new Date(),
        fileId: null,
        ocrName: null,
      },
    });
    // No note and no name in the audit row.
    await audit(tx, {
      actorId,
      action: "receipts.check.settle",
      subjectType: "receipt_check",
      subjectId: id,
      before: { verdict: "warn" },
      after: { verdict, settlement: input.decision },
    });
    return { row: updated, storageKey };
  });
}

/** The stored copy of a check, for staff. Audited. 404 when there is no row or no file. */
export async function receiptFileFor(id: string, actorId: string) {
  const row = await prisma.receiptCheck.findUnique({ where: { id }, select: { fileId: true } });
  if (!row?.fileId) throw notFound("No stored copy for this receipt check");
  const file = await readFile(row.fileId);
  await prisma.$transaction((tx) =>
    audit(tx, { actorId, action: "receipts.file.view", subjectType: "receipt_check", subjectId: id }),
  );
  return file;
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
    settlement: string | null;
    settleNote: string | null;
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
    // Staff's decision on a warn. The note is shown only for a Fail: it tells the student what to fix.
    settlement: row.settlement === "pass" || row.settlement === "fail" ? row.settlement : null,
    settleNote: row.settlement === "fail" ? row.settleNote : null,
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
 * A check staff settled as Fail is open again: the student can upload a new receipt.
 * Staff can always check again.
 */
export function studentLocked(
  row: { verdict: string; checkedById: string | null; settlement?: string | null } | null,
  viewerId: string,
): boolean {
  if (!row) return false;
  return row.verdict === "ok" || (row.checkedById !== viewerId && row.settlement !== "fail");
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

/**
 * deleteFileRecord for a check's file id. The check has no relation to `files` (no foreign key), so its file row can
 * already be gone (swept, or removed by a concurrent request). Then there is nothing to delete and no bytes to remove:
 * returns null instead of letting Prisma's P2025 fail the transaction.
 */
export async function deleteCheckFileRecord(tx: Tx, fileId: string): Promise<string | null> {
  try {
    return await deleteFileRecord(tx, fileId);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return null;
    throw error;
  }
}

/** Deletes the row and its file record. Returns the storage key to remove after the commit (null when no file). */
export async function deleteReceiptCheck(id: string): Promise<string | null> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.receiptCheck.findUnique({ where: { id }, select: { fileId: true } });
    if (!row) throw notFound("Receipt check not found");
    // deleteMany: a concurrent delete of the same id answers 404 instead of a Prisma error.
    const { count } = await tx.receiptCheck.deleteMany({ where: { id } });
    if (count === 0) throw notFound("Receipt check not found");
    return row.fileId ? deleteCheckFileRecord(tx, row.fileId) : null;
  });
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
 * for what may be shown, `studentLocked` for whether they can send again. The text is built only from the verdict,
 * who checked it and staff's Pass/Fail settlement: never a reference, amount, name, ID, check detail, the staff note
 * or another student's row.
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

  // staffChecked: the same test studentLocked uses (a check run by someone else is a staff check), as on the web page.
  const { verdict, staffChecked, settlement } = studentView(row, me.id);
  // Staff settled a warn: the same labels as the web page. The Fail note stays on the web page, not in the chat.
  if (settlement === "pass") {
    return { text: `ใบเสร็จภาคการศึกษานี้: ${VERDICT_TH.ok} (เจ้าหน้าที่ตรวจแล้ว)\n${LOCKED_NOTE}`, link };
  }
  if (settlement === "fail") {
    return {
      text: `ใบเสร็จภาคการศึกษานี้: ${VERDICT_TH.fail} (เจ้าหน้าที่ตรวจแล้ว)\nดูเหตุผลและส่งใบเสร็จใหม่ได้ที่หน้าเว็บ`,
      link,
    };
  }
  const label = VERDICT_TH[verdict] ?? "รอเจ้าหน้าที่ตรวจ";
  // Locked (passed, or checked by staff): no resend, as on the web page. Otherwise the student may send again.
  const second = studentLocked(row, me.id)
    ? `${staffChecked ? "เจ้าหน้าที่ตรวจแล้ว" : "ระบบตรวจอัตโนมัติแล้ว"} ${LOCKED_NOTE}`
    : "เจ้าหน้าที่ยังไม่ตรวจ ส่งใหม่ได้ที่หน้าเว็บ";
  return { text: `ใบเสร็จภาคการศึกษานี้: ${label}\n${second}`, link };
}
