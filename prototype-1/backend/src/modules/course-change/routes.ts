import { signatureBatchSchema, createSignatureBatch, signatureBatches, signatureBatch } from "./signatureBatches.js";
import { submitRequest, schedules, saveSchedule, scheduleSchema, actionSchema, action, uploadFile, mergeFiles, downloadFile, FILE_KINDS } from "./workflow.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { validation } from "../../lib/errors.js";
import { requireUser } from "../../plugins/auth.js";
import { getSettings, saveSettings, settingsSchema } from "./settings.js";
import {
  approveRequest,
  bulkApprove,
  cancelRequest,
  ccToday,
  completeRequest,
  eligibleCourses,
  getContext,
  getDocumentHtml,
  getRequest,
  recoverSubmission,
  listRequests,
  requestGroups,
  rejectRequest,

} from "./service.js";

const idParam = z.object({ id: z.string().uuid() });
const requestType = z.enum(["drop", "withdraw"]);

const submitSchema = z.object({
  clientRequestId: z.string().uuid().optional(),
  requestType,
  courseId: z.string().uuid(),
  reason: z.string().trim().min(5, "กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร").max(1000),
  routePreview: z.object({
    termId: z.string().uuid(),
    flow: z.enum(["reg_direct", "advisor_pi", "program_registrar"]),
    opensOn: z.string().date(),
    closesOn: z.string().date(),
    scheduleId: z.string().uuid().optional(), scheduleRevision: z.number().int().nonnegative().optional(),
  }).optional(),
});

const listSchema = z.object({
  section: z.string().trim().min(1).max(30).optional(),
  phase: z.enum(["staff_review", "student_revision", "awaiting_signature", "student_external", "ready_registrar", "awaiting_result"]).optional(),
  status: z.enum(["pending_approval", "processing", "completed", "rejected", "cancelled", "done"]).optional(),
  type: requestType.optional(),
  courseId: z.string().uuid().optional(),
  termId: z.string().uuid().optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const rejectSchema = z.object({
  reason: z.string().trim().min(1, "ต้องระบุเหตุผลที่ไม่อนุมัติ").max(500),
});

const completeSchema = z.object({ note: z.string().trim().max(500).optional() });

const bulkSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(50) });

/** Course Change API — docs/course-change/DESIGN.md §8. */
export async function courseChangeRoutes(app: FastifyInstance): Promise<void> {
  app.get("/course-change/signature-batches", {config:{auth:"admin"}}, signatureBatches);
  app.get("/course-change/signature-batches/:id", {config:{auth:"admin"}}, req => signatureBatch(idParam.parse(req.params).id));
  app.post("/course-change/signature-batches", {config:{auth:"admin"}}, req => createSignatureBatch(signatureBatchSchema.parse(req.body), requireUser(req)));

  app.get("/course-change/schedules", { config: { auth: "admin" } }, schedules);
  app.post("/course-change/schedules", { config: { auth: "admin" } }, req => saveSchedule(scheduleSchema.parse(req.body), requireUser(req)));
  app.post("/course-change/requests/:id/workflow", { config: { auth: "user" } }, async req => {
    const { id } = idParam.parse(req.params);
    return { request: await action(id, actionSchema.parse(req.body), requireUser(req)) };
  });
  app.post("/course-change/requests/:id/files", { config: { auth: "user" } }, async req => {
    const { id } = idParam.parse(req.params);
    const { revision, kind } = z.object({ revision: z.coerce.number().int().nonnegative(), kind: z.enum(FILE_KINDS) }).parse(req.query);
    const part = await req.file({ limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 } });
    if (!part) throw validation("กรุณาแนบไฟล์ PDF");
    return { request: await uploadFile(id, revision, kind, part.filename, await part.toBuffer(), requireUser(req)) };
  });
  app.post("/course-change/requests/:id/merge", { config: { auth: "student" } }, async req => {
    const { id } = idParam.parse(req.params);
    const { revision, ids } = z.object({ revision: z.number().int().nonnegative(), ids: z.array(z.string().uuid()).length(2) }).parse(req.body);
    return { request: await mergeFiles(id, revision, ids, requireUser(req)) };
  });
  app.get("/course-change/requests/:id/files/:fileId", { config: { auth: "user" } }, async (req, reply) => {
    const { id, fileId } = z.object({ id: z.string().uuid(), fileId: z.string().uuid() }).parse(req.params);
    const file = await downloadFile(id, fileId, requireUser(req));
    return reply.type("application/pdf").header("Cache-Control", "private, no-store").header("X-Content-Type-Options", "nosniff")
      .header("Content-Disposition", `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(file.filename)}`).send(Buffer.from(file.data));
  });

  app.get("/course-change/submissions/:id", { config: { auth: "student" } }, async (req) => {
    const { id } = idParam.parse(req.params);
    return { request: await recoverSubmission(id, requireUser(req)) };
  });
  app.get("/course-change/request-groups", { config: { auth: "admin" } }, async (req) => {
    return requestGroups(listSchema.parse(req.query), requireUser(req));
  });
  app.get("/course-change/settings", { config: { auth: "admin" } }, () => getSettings());
  app.post("/course-change/settings", { config: { auth: "admin" } }, (req) =>
    saveSettings(settingsSchema.parse(req.body), requireUser(req)));
  app.get("/course-change/context", { config: { auth: "user" } }, async () =>
    getContext(ccToday()),
  );

  app.get("/course-change/eligible-courses", { config: { auth: "student" } }, async (req) => {
    const me = requireUser(req);
    const { type } = z.object({ type: requestType }).parse(req.query);
    return eligibleCourses(me, type, ccToday());
  });

  app.post("/course-change/requests", { config: { auth: "student" } }, async (req, reply) => {
    const me = requireUser(req);
    const input = submitSchema.parse(req.body);
    return reply.code(201).send({ request: await submitRequest(input, me, ccToday()) });
  });

  app.get("/course-change/requests", { config: { auth: "user" } }, async (req) => {
    const me = requireUser(req);
    return listRequests(listSchema.parse(req.query), me);
  });

  app.get("/course-change/requests/:id", { config: { auth: "user" } }, async (req) => {
    const me = requireUser(req);
    const { id } = idParam.parse(req.params);
    return { request: await getRequest(id, me) };
  });

  app.post("/course-change/requests/:id/cancel", { config: { auth: "student" } }, async (req) => {
    const me = requireUser(req);
    const { id } = idParam.parse(req.params);
    return { request: await cancelRequest(id, me) };
  });

  // ------------------------------------------------------------- staff only
  app.post("/course-change/requests/bulk-review", { config: { auth: "admin" } }, async req => {
    const { items } = z.object({ items: z.array(z.object({ id: z.string().uuid(), revision: z.number().int().nonnegative() })).min(1).max(50) }).parse(req.body);
    const results: {id:string;ok:boolean;message?:string}[] = [];
    for (const item of items) {
      try { await action(item.id, {revision:item.revision, action:"review", note:"ตรวจความครบถ้วนแบบกลุ่ม"}, requireUser(req)); results.push({id:item.id,ok:true}); }
      catch(e) { results.push({id:item.id,ok:false,message:e instanceof Error?e.message:"บันทึกไม่สำเร็จ"}); }
    }
    return { results };
  });
  app.post("/course-change/requests/bulk-approve", { config: { auth: "admin" } }, async (req) => {
    const me = requireUser(req);
    const { ids } = bulkSchema.parse(req.body);
    return bulkApprove(ids, me);
  });

  app.post("/course-change/requests/:id/approve", { config: { auth: "admin" } }, async (req) => {
    const me = requireUser(req);
    const { id } = idParam.parse(req.params);
    return { request: await approveRequest(id, me) };
  });

  app.post("/course-change/requests/:id/reject", { config: { auth: "admin" } }, async (req) => {
    const me = requireUser(req);
    const { id } = idParam.parse(req.params);
    const { reason } = rejectSchema.parse(req.body);
    return { request: await rejectRequest(id, reason, me) };
  });

  app.post("/course-change/requests/:id/complete", { config: { auth: "admin" } }, async (req) => {
    const me = requireUser(req);
    const { id } = idParam.parse(req.params);
    const { note } = completeSchema.parse(req.body ?? {});
    return { request: await completeRequest(id, note ?? null, me) };
  });

  // ---------------------------------------------------------------- document
  app.get(
    "/course-change/requests/:id/document",
    { config: { auth: "user" } },
    async (req, reply) => {
      const me = requireUser(req);
      const { id } = idParam.parse(req.params);
      const html = await getDocumentHtml(id, me);
      return reply
        .type("text/html; charset=utf-8")
        // The page is static: no scripts, inline styles only.
        .header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'")
        .send(html);
    },
  );
}
