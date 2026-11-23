import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { AppError, badRequest } from "../../lib/errors.js";
import { requireUser } from "../../plugins/auth.js";
import {
  checkReceipt,
  deleteReceiptCheck,
  listReceiptChecks,
  OcrUnavailableError,
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

export async function receiptRoutes(app: FastifyInstance): Promise<void> {
  app.post("/receipts/check", { config: { auth: "any" } }, async (req, reply) => {
    const me = requireUser(req);
    const { file, fields } = await readUpload(req);
    if (!file) throw badRequest("A `file` field is required");
    const input = parseOr400(
      checkFieldsSchema,
      { studentId: fields.studentId, term: fields.term || undefined },
      "Invalid receipt check request",
    );

    try {
      const { check, fields: ocrFields } = await checkReceipt({ ...input, file, checkedById: me.id });
      // `fields` includes the student's name; it goes back to the staff member for display only.
      return { check, fields: ocrFields };
    } catch (err) {
      if (err instanceof OcrUnavailableError) {
        throw new AppError("SERVICE_UNAVAILABLE", "OCR service unavailable");
      }
      throw err;
    }
  });

  app.get("/receipts", { config: { auth: "any" } }, async (req) => {
    requireUser(req);
    const query = parseOr400(listQuerySchema, req.query, "Invalid filter");
    return { items: await listReceiptChecks(query) };
  });

  app.delete("/receipts/:id", { config: { auth: "any" } }, async (req, reply) => {
    requireUser(req);
    const { id } = parseOr400(idParamSchema, req.params, "Invalid receipt check id");
    await deleteReceiptCheck(id);
    return reply.code(204).send();
  });
}
