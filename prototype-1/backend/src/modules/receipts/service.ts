import { z } from "zod";
import { config } from "../../config.js";
import { prisma, type Tx } from "../../db.js";
import { AppError, notFound } from "../../lib/errors.js";

/** Receipts are buffered in memory (max 10 MB) and forwarded to the OCR sidecar; nothing is written to disk. */
export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
}

export type Verdict = "ok" | "warn" | "fail";

const DUPLICATE_CHECK = "Not submitted before";

const sidecarResponse = z.object({
  kind: z.enum(["pdf", "screenshot"]),
  // Each field is {value, box, pii}; only `value` is read here. Names come back to staff, never stored.
  fields: z.record(z.object({ value: z.string().nullable() }).passthrough()),
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
  dup: { studentId: string; term: string } | null,
): SidecarCheck[] {
  if (!reference) return checks;
  const check: SidecarCheck = dup
    ? {
        name: DUPLICATE_CHECK,
        state: "fail",
        detail: `reference already used for student ${dup.studentId}, term ${dup.term}`,
      }
    : { name: DUPLICATE_CHECK, state: "ok", detail: "reference not used in any other check" };
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
}

/** Runs one receipt through the sidecar, records the check (one row per student and term) and returns the fields for display. */
export async function checkReceipt(input: CheckInput) {
  const term = input.term ?? currentTerm();
  const sidecar = await askSidecar(input.file, input.studentId, term);

  const columns = columnsFrom(sidecar.fields);
  const reference = columns.reference;

  // The duplicate lookup and the save. A re-check replaces the earlier row, so it starts a new retention clock.
  const save = async (db: Tx) => {
    const dup = reference
      ? await db.receiptCheck.findFirst({
          where: { reference, NOT: { studentId: input.studentId, term } },
          select: { studentId: true, term: true },
          orderBy: { createdAt: "desc" },
        })
      : null;

    const checks = applyReferenceCheck(sidecar.checks, reference, dup);
    const data = {
      kind: sidecar.kind,
      ...columns,
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

  // With a reference, the lookup and the save run in one transaction holding an advisory lock on that reference:
  // two concurrent checks with the same reference cannot both read "no duplicate" before either one saves.
  const check = reference
    ? await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${reference}))`;
        return save(tx);
      })
    : await save(prisma);

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

export async function deleteReceiptCheck(id: string): Promise<void> {
  const { count } = await prisma.receiptCheck.deleteMany({ where: { id } });
  if (count === 0) throw notFound("Receipt check not found");
}
