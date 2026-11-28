import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { config } from "../../config.js";
import { AppError, badRequest, conflict, forbidden } from "../../lib/errors.js";
import { removeStoredFile } from "../../core/files.js";
import { can, type SessionUser } from "../../core/permissions.js";
import { requireUser } from "../../plugins/auth.js";
import {
  checkReceipt,
  currentTerm,
  ownCheckForTerm,
  studentLocked,
  deleteReceiptCheck,
  listOwnReceiptChecks,
  listReceiptChecks,
  OcrUnavailableError,
  RECEIPT_LOCKED_MESSAGE,
  receiptFileFor,
  settleReceiptCheck,
  settleSchema,
  staffRowViews,
  studentView,
  type UploadedFile,
} from "./service.js";

const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

const termSchema = z.string().regex(/^[123]\/25\d\d$/, "must look like 1/2569");
const checkFieldsSchema = z.object({
  studentId: z.string().regex(/^\d{10}$/, "must be exactly 10 digits"),
  term: termSchema.optional(),
});
const listQuerySchema = z.object({
  term: termSchema.optional(),
  verdict: z.enum(["ok", "warn", "fail"]).optional(),
});
const idParamSchema = z.object({ id: z.string().uuid() });

/** Zod issues go back as 400 with field paths only: the rejected value is never echoed (it may be a student ID). */
function parseOr400<T extends z.ZodTypeAny>(schema: T, value: unknown, message: string): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw badRequest(
      message,
      result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    );
  }
  return result.data;
}

/** Reads the multipart body: one `file` part (checked for type and size) plus the text fields. */
async function readUpload(req: FastifyRequest): Promise<{ file?: UploadedFile; fields: Record<string, string> }> {
  const fields: Record<string, string> = {};
  let file: UploadedFile | undefined;
  try {
    for await (const part of req.parts({ limits: { fileSize: RECEIPT_MAX_BYTES, files: 1, fields: 5 } })) {
      if (part.type === "field") {
        fields[part.fieldname] = String(part.value);
        continue;
      }
      if (part.fieldname !== "file" || file) throw badRequest("Send exactly one `file` field");
      if (!ALLOWED_TYPES.has(part.mimetype)) {
        throw new AppError("UNSUPPORTED_MEDIA_TYPE", "Only PDF, JPEG or PNG receipts are accepted");
      }
      const buffer = await part.toBuffer();
      if (part.file.truncated) throw new AppError("PAYLOAD_TOO_LARGE", "Receipt file is over 10 MB");
      file = { buffer, mimetype: part.mimetype };
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    const code = (err as { code?: string }).code;
    if (code === "FST_REQ_FILE_TOO_LARGE") throw new AppError("PAYLOAD_TOO_LARGE", "Receipt file is over 10 MB");
    throw badRequest("Malformed upload, send multipart/form-data");
  }
  return { file, fields };
}

/** Removes file contents after their row is gone. A failure leaves an orphan that scripts/files-sweep.ts removes. */
async function removeContents(req: FastifyRequest, keys: (string | null)[]): Promise<void> {
  for (const storageKey of keys) {
    if (!storageKey) continue;
    try {
      await removeStoredFile(storageKey);
    } catch (error) {
      req.log.error({ err: error, storageKey }, "Failed to remove receipt file contents");
    }
  }
}

/** The student number a student may act on. Staff accounts have none, so they get 403 here. */
function ownStudentNo(me: SessionUser): string {
  if (!me.studentNo) throw forbidden("Only students with a student number can submit a receipt");
  return me.studentNo;
}

export async function receiptRoutes(app: FastifyInstance): Promise<void> {
  app.post("/receipts/check", { config: { auth: "user", permission: "receipts.manage" } }, async (req, reply) => {
    const me = requireUser(req);
    const { file, fields } = await readUpload(req);
    if (!file) throw badRequest("A `file` field is required");
    const input = parseOr400(
      checkFieldsSchema,
      { studentId: fields.studentId, term: fields.term || undefined },
      "Invalid receipt check request",
    );

    try {
      const { check, fields: ocrFields, staleKeys } = await checkReceipt({ ...input, file, checkedById: me.id });
      await removeContents(req, staleKeys);
      const canManage = can(me, "receipts.manage");
      const [row] = await staffRowViews([check], { canSeeName: canManage, canSeeNote: canManage });
      // `fields` includes the student's name; it goes back to the staff member for display only.
      return { check: row, fields: ocrFields };
    } catch (err) {
      if (err instanceof OcrUnavailableError) {
        throw new AppError("SERVICE_UNAVAILABLE", "OCR service unavailable");
      }
      throw err;
    }
  });

  // Student routes: the student's own ID (never one from the form), the current term, a safe response.
  app.post("/receipts/mine", { config: { auth: "user", permission: "receipts.use" } }, async (req) => {
    const me = requireUser(req);
    const studentId = ownStudentNo(me);
    // Any studentId or term fields in the form are read and dropped.
    const { file } = await readUpload(req);
    if (!file) throw badRequest("A `file` field is required");

    const term = currentTerm();
    // Checked before the OCR call, so a locked upload costs nothing.
    if (studentLocked(await ownCheckForTerm(studentId, term), me.id)) {
      throw conflict(RECEIPT_LOCKED_MESSAGE);
    }

    try {
      // selfService: the save re-checks the lock, because staff may have checked the term during the OCR call.
      const { check, staleKeys } = await checkReceipt({ studentId, term, file, checkedById: me.id, selfService: true });
      await removeContents(req, staleKeys);
      return { check: studentView(check, me.id) };
    } catch (err) {
      if (err instanceof OcrUnavailableError) {
        throw new AppError("SERVICE_UNAVAILABLE", "OCR service unavailable");
      }
      throw err;
    }
  });

  app.get("/receipts/mine", { config: { auth: "user", permission: "receipts.use" } }, async (req) => {
    const me = requireUser(req);
    const studentId = ownStudentNo(me);
    const rows = await listOwnReceiptChecks(studentId);
    const term = currentTerm();
    // `locked`: this term's upload is settled, so the page shows "contact staff" instead of the form.
    // `fileDays`: how long the server keeps the uploaded copy for staff (the student page quotes it).
    return {
      items: rows.map((r) => studentView(r, me.id)),
      locked: studentLocked(rows.find((r) => r.term === term) ?? null, me.id),
      fileDays: config.RECEIPT_FILE_DAYS,
    };
  });

  app.get("/receipts", { config: { auth: "user", permission: "receipts.view" } }, async (req) => {
    const me = requireUser(req);
    const query = parseOr400(listQuerySchema, req.query, "Invalid filter");
    const rows = await listReceiptChecks(query);
    // The OCR'd name and the staff settle note go only to viewers who can manage receipts.
    const canManage = can(me, "receipts.manage");
    return { items: await staffRowViews(rows, { canSeeName: canManage, canSeeNote: canManage }) };
  });

  app.post("/receipts/:id/settle", { config: { auth: "user", permission: "receipts.manage" } }, async (req) => {
    const me = requireUser(req);
    const { id } = parseOr400(idParamSchema, req.params, "Invalid receipt check id");
    const body = parseOr400(settleSchema, req.body ?? {}, "Invalid settle request");
    const { row, storageKey } = await settleReceiptCheck(id, body, me.id);
    await removeContents(req, [storageKey]);
    const [view] = await staffRowViews([row], { canSeeName: true, canSeeNote: true });
    return { check: view };
  });

  app.get("/receipts/:id/file", { config: { auth: "user", permission: "receipts.manage" } }, async (req, reply) => {
    const me = requireUser(req);
    const { id } = parseOr400(idParamSchema, req.params, "Invalid receipt check id");
    const file = await receiptFileFor(id, me.id);
    return reply
      .type("image/jpeg")
      .header("Content-Disposition", 'inline; filename="receipt.jpg"')
      .header("X-Content-Type-Options", "nosniff")
      .header("Cache-Control", "no-store")
      .send(file.buffer);
  });

  app.delete("/receipts/:id", { config: { auth: "user", permission: "receipts.manage" } }, async (req, reply) => {
    requireUser(req);
    const { id } = parseOr400(idParamSchema, req.params, "Invalid receipt check id");
    await removeContents(req, [await deleteReceiptCheck(id)]);
    return reply.code(204).send();
  });
}
