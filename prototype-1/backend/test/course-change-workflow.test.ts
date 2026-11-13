import { randomUUID } from "node:crypto";
import { PDFDocument, PDFName } from "pdf-lib";
import type { FastifyInstance } from "fastify";
import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
} from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { config } from "../src/config.js";
let app: FastifyInstance;
let student: string;
let other: string;
let staff: string;
let courseId: string;
let termId: string;
let ownerId: string;
let pdf: Buffer;
const today = config.COURSE_CHANGE_TODAY;
const post = (
  url: string,
  cookie: string,
  body: Record<string, unknown> = {},
) =>
  app.inject({
    method: "POST",
    url: `/api/v1/course-change${url}`,
    headers: { cookie, "x-requested-with": "XMLHttpRequest" },
    payload: body,
  });
const get = (url: string, cookie = student) =>
  app.inject({
    method: "GET",
    url: `/api/v1/course-change${url}`,
    headers: { cookie },
  });
const schedule = (extra: Record<string, unknown> = {}) => ({
  termId,
  courseId,
  section: "*",
  requestType: "withdraw",
  label: "TEST explicit programme dates",
  format: "block",
  opensOn: "2026-09-01",
  closesOn: "2026-10-25",
  finalOn: null,
  flow: "advisor_pi",
  needsSignature: true,
  needsReg: true,
  needsPi: true,
  needsMerge: true,
  published: true,
  reason: "TEST confirmed dates",
  ...extra,
});
const publish = async (extra: Record<string, unknown> = {}) =>
  post("/schedules", staff, schedule(extra));
const submit = async (extra: Record<string, unknown> = {}) =>
  post("/requests", student, {
    requestType: "withdraw",
    courseId,
    reason: "ต้องการถอนตามประกาศ",
    ...extra,
  });
const act = async (
  r: { id: string; revision: number },
  action: string,
  cookie = staff,
  note = "TEST checked reference",
  extra: Record<string, unknown> = {},
) =>
  post(`/requests/${r.id}/workflow`, cookie, {
    revision: r.revision,
    action,
    note,
    ...extra,
  });
async function upload(
  r: { id: string; revision: number },
  kind: string,
  cookie = staff,
  data = pdf,
) {
  const boundary = "test-pdf-boundary";
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="petition.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return app.inject({
    method: "POST",
    url: `/api/v1/course-change/requests/${r.id}/files?revision=${r.revision}&kind=${kind}`,
    headers: {
      cookie,
      "x-requested-with": "XMLHttpRequest",
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
    payload,
  });
}
beforeAll(async () => {
  app = await buildApp();
  async function login(email: string, password: string) {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { "x-requested-with": "XMLHttpRequest" },
      payload: { email, password },
    });
    expect(r.statusCode).toBe(200);
    return `labsync_session=${r.cookies.find((c) => c.name === "labsync_session")!.value}`;
  }
  student = await login("student3@cedt.edu", "student1234");
  other = await login("student2@cedt.edu", "student1234");
  staff = await login("admin@cedt.edu", "admin1234");
  ownerId = (
    await prisma.user.findUniqueOrThrow({
      where: { email: "student3@cedt.edu" },
    })
  ).id;
  termId = (await prisma.term.findFirstOrThrow({ where: { isActive: true } }))
    .id;
  const doc = await PDFDocument.create();
  doc.addPage();
  pdf = Buffer.from(await doc.save());
});
beforeEach(async () => {
  const c = await prisma.course.create({
    data: {
      code: `WF-${randomUUID().slice(0, 8)}`,
      name: "Workflow isolated fixture",
      catalogSource: "test",
    },
  });
  courseId = c.id;
  await prisma.enrollment.create({
    data: { studentId: ownerId, termId, courseId, section: "101" },
  });
  await prisma.allowedCourse.create({ data: { termId, courseId } });
});
afterEach(async () => {
  await prisma.courseChangeSignatureBatch.deleteMany({ where: { courseId } });
  config.COURSE_CHANGE_TODAY = today;
  await prisma.courseChangeRequest.deleteMany({ where: { courseId } });
  await prisma.courseChangeSchedule.deleteMany({ where: { courseId } });
  await prisma.allowedCourse.deleteMany({ where: { courseId } });
  await prisma.enrollment.deleteMany({ where: { courseId } });
  await prisma.course.delete({ where: { id: courseId } });
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("Published course schedules", () => {
  it("stores the teaching period separately from petition dates without computing a deadline", async () => {
    expect((await publish({ teachingStartsOn: "2026-09-01" })).statusCode).toBe(
      422,
    );
    const res = await publish({
      teachingStartsOn: "2026-09-01",
      teachingEndsOn: "2026-10-25",
    });
    expect(res.statusCode).toBe(200);
    const saved = res
      .json()
      .items.find((s: { courseId: string }) => s.courseId === courseId);
    expect(saved).toMatchObject({
      teachingStartsOn: "2026-09-01",
      teachingEndsOn: "2026-10-25",
      closesOn: "2026-10-25",
    });
  });

  it("does not infer dates from legacy term windows or a draft schedule", async () => {
    expect((await submit()).statusCode).toBe(422);
    expect((await publish({ published: false })).statusCode).toBe(200);
    expect((await submit()).statusCode).toBe(422);
  });
  it("limits configuration to staff and rejects overlapping publication", async () => {
    expect((await post("/schedules", student, schedule())).statusCode).toBe(
      403,
    );
    expect((await publish()).statusCode).toBe(200);
    expect((await publish()).statusCode).toBe(409);
  });
  it("validates the task combination and dates without inventing a Block formula", async () => {
    expect(
      (await publish({ needsReg: false, needsMerge: true })).statusCode,
    ).toBe(422);
    expect((await publish({ opensOn: "2026-10-26" })).statusCode).toBe(422);
    expect((await publish({ finalOn: "2026-09-20" })).statusCode).toBe(422);
  });
  it("lets an exact Section override wildcard even while the exact period is closed", async () => {
    await publish();
    await publish({ section: "101", opensOn: "2026-10-01" });
    const res = await get("/eligible-courses?type=withdraw");
    expect(
      res
        .json()
        .items.find((c: { courseId: string }) => c.courseId === courseId)
        .eligible,
    ).toBe(false);
    expect((await submit()).statusCode).toBe(422);
  });
  it("uses the matching Section and allows the last published day only", async () => {
    await publish({ section: "102" });
    expect((await submit()).statusCode).toBe(422);
    await publish({ section: "101", closesOn: "2026-09-30" });
    expect((await submit()).statusCode).toBe(201);
    config.COURSE_CHANGE_TODAY = "2026-10-01";
    const r = await submit({ clientRequestId: randomUUID() });
    expect(r.statusCode).toBe(422);
  });
  it("rejects a stale route preview and a stale schedule edit", async () => {
    await publish();
    const s = (await get("/schedules", staff))
      .json()
      .items.find((s: { courseId: string }) => s.courseId === courseId);
    expect(
      (
        await publish({
          id: s.id,
          revision: s.revision,
          closesOn: "2026-10-24",
        })
      ).statusCode,
    ).toBe(200);
    expect((await publish({ id: s.id, revision: s.revision })).statusCode).toBe(
      409,
    );
    expect(
      (
        await submit({
          routePreview: {
            termId,
            flow: s.flow,
            opensOn: s.opensOn,
            closesOn: s.closesOn,
            scheduleId: s.id,
            scheduleRevision: s.revision,
          },
        })
      ).statusCode,
    ).toBe(409);
  });
});
describe("Version 2 review and correction", () => {
  it("requires a reason and current revision to reject a new request", async () => {
    await publish();
    const r = (await submit()).json().request;
    expect((await act(r, "reject", staff, "")).statusCode).toBe(422);
    expect(
      (
        await post(`/requests/${r.id}/reject`, staff, {
          reason: "old endpoint bypass",
        })
      ).statusCode,
    ).toBe(409);
    const rejected = await act(r, "reject", staff, "ไม่เข้าเงื่อนไขตามประกาศ");
    expect(rejected.json().request).toMatchObject({
      status: "rejected",
      rejectReason: "ไม่เข้าเงื่อนไขตามประกาศ",
    });
    expect((await submit()).statusCode).toBe(201);
  });
  it("filters the staff queue by workflow stage and Section for collection", async () => {
    await publish();
    const r = (await submit()).json().request;
    expect(
      (await get("/requests?phase=staff_review&section=101", staff))
        .json()
        .items.some((item: { id: string }) => item.id === r.id),
    ).toBe(true);
    expect(
      (await get("/requests?phase=staff_review&section=102", staff))
        .json()
        .items.some((item: { id: string }) => item.id === r.id),
    ).toBe(false);
    await act(r, "review");
    expect(
      (await get("/requests?phase=awaiting_signature&section=101", staff))
        .json()
        .items.some((item: { id: string }) => item.id === r.id),
    ).toBe(true);
  });

  it("always starts with staff review and no automatic registry/PI events", async () => {
    await publish({
      flow: "reg_direct",
      needsSignature: false,
      needsPi: false,
      needsMerge: false,
    });
    const res = await submit();
    expect(res.statusCode).toBe(201);
    const r = res.json().request;
    expect(r).toMatchObject({
      workflowVersion: 2,
      phase: "staff_review",
      status: "pending_approval",
      regChulaRef: null,
      piRef: null,
      hasDocument: false,
    });
    expect(
      r.steps.some((step: { label: string }) => step.label.includes("จำลอง")),
    ).toBe(false);
    expect(r.events.map((e: { eventType: string }) => e.eventType)).toEqual([
      "submitted",
    ]);
    expect((await post(`/requests/${r.id}/approve`, staff)).statusCode).toBe(
      409,
    );
    expect((await act(r, "complete")).statusCode).toBe(409);
  });
  it("round trips correction in the original request, retaining the original retry key", async () => {
    await publish();
    const key = randomUUID();
    let r = (await submit({ clientRequestId: key })).json().request;
    expect((await act(r, "request_revision", staff, "")).statusCode).toBe(422);
    r = (await act(r, "request_revision", staff, "แก้เหตุผลให้ครบ")).json()
      .request;
    expect(r.phase).toBe("student_revision");
    expect((await act(r, "review")).statusCode).toBe(409);
    expect(
      (await act(r, "resubmit", other, "", { reason: "แก้ไขรายละเอียดแล้ว" }))
        .statusCode,
    ).toBe(404);
    config.COURSE_CHANGE_TODAY = "2026-12-07";
    r = (
      await act(r, "resubmit", student, "", { reason: "แก้ไขรายละเอียดแล้ว" })
    ).json().request;
    expect(r.phase).toBe("staff_review");
    const replay = await submit({ clientRequestId: key });
    expect(replay.json().request.id).toBe(r.id);
    expect(replay.json().request.reason).toBe("แก้ไขรายละเอียดแล้ว");
  });
  it("protects against concurrent or stale staff actions", async () => {
    await publish();
    const r = (await submit()).json().request;
    const responses = await Promise.all([act(r, "review"), act(r, "review")]);
    expect(responses.map((v) => v.statusCode).sort()).toEqual([200, 409]);
    expect((await act(r, "request_revision")).statusCode).toBe(409);
  });
  it("retains the submitted workflow when a schedule is edited or unpublished", async () => {
    await publish();
    const r = (await submit()).json().request;
    const s = (await get("/schedules", staff))
      .json()
      .items.find((s: { courseId: string }) => s.courseId === courseId);
    await publish({
      id: s.id,
      revision: s.revision,
      published: false,
      needsMerge: false,
    });
    const read = (await get(`/requests/${r.id}`)).json().request;
    expect(read.workflowPlan.needsMerge).toBe(true);
    expect((await act(read, "review")).json().request.phase).toBe(
      "awaiting_signature",
    );
  });
  it("reports stale rows separately in a bulk review", async () => {
    await publish();
    const r = (await submit()).json().request;
    const res = await post("/requests/bulk-review", staff, {
      items: [
        { id: r.id, revision: r.revision },
        { id: r.id, revision: r.revision },
      ],
    });
    expect(res.json().results.map((v: { ok: boolean }) => v.ok)).toEqual([
      true,
      false,
    ]);
  });
});
describe("Private PDF documents and human evidence", () => {
  it("completes the signature, Reg, merge, PI, document check and manual result flow", async () => {
    await publish();
    let r = (await submit()).json().request;
    r = (await act(r, "review")).json().request;
    expect((await act(r, "return_signed")).statusCode).toBe(422);
    expect((await upload(r, "signed_petition", student)).statusCode).toBe(403);
    const signed = await upload(r, "signed_petition");
    expect(signed.statusCode).toBe(200);
    r = signed.json().request;
    expect(
      (await get(`/requests/${r.id}/files/${r.files[0].id}`, other)).statusCode,
    ).toBe(404);
    expect(
      (await get(`/requests/${r.id}/files/${r.files[0].id}`)).statusCode,
    ).toBe(404);
    const signedId = r.files[0].id;
    r = (await act(r, "return_signed")).json().request;
    const downloaded = await get(`/requests/${r.id}/files/${signedId}`);
    expect(downloaded.headers["cache-control"]).toContain("no-store");
    expect(downloaded.headers["content-type"]).toContain("application/pdf");
    expect(r.phase).toBe("student_external");
    expect((await act(r, "documents_checked")).statusCode).toBe(422);
    expect((await act(r, "reg_done", staff)).statusCode).toBe(403);
    r = (await act(r, "reg_done", student, "Reg receipt TEST-123")).json()
      .request;
    expect((await act(r, "pi_done", student)).statusCode).toBe(422);
    r = (await upload(r, "reg_petition", student)).json().request;
    const ids = r.files.map((f: { id: string }) => f.id);
    const merged = await post(`/requests/${r.id}/merge`, student, {
      revision: r.revision,
      ids,
    });
    expect(merged.statusCode).toBe(200);
    r = merged.json().request;
    const mergedFile = r.files.find(
      (f: { kind: string }) => f.kind === "merged",
    );
    const file = await get(`/requests/${r.id}/files/${mergedFile.id}`);
    expect((await PDFDocument.load(file.rawPayload)).getPageCount()).toBe(2);
    r = (await act(r, "pi_done", student, "PI receipt TEST-321")).json()
      .request;
    r = (await act(r, "documents_checked")).json().request;
    expect(r).toMatchObject({ phase: "awaiting_result", status: "processing" });
    expect(
      (await post(`/requests/${r.id}/complete`, staff, { note: "bypass" }))
        .statusCode,
    ).toBe(409);
    expect((await act(r, "complete", staff, "")).statusCode).toBe(422);
    r = (
      await act(r, "request_documents", staff, "แก้หลักฐานส่ง PI ให้ถูกต้อง")
    ).json().request;
    expect((await act(r, "documents_checked")).statusCode).toBe(422);
    expect((await act(r, "pi_done", student)).statusCode).toBe(422);
    r = (await act(r, "reg_done", student)).json().request;
    const mergedAgain = await post(`/requests/${r.id}/merge`, student, {
      revision: r.revision,
      ids,
    });
    expect(mergedAgain.statusCode).toBe(200);
    r = mergedAgain.json().request;
    r = (await act(r, "pi_done", student, "PI corrected TEST-654")).json()
      .request;
    r = (await act(r, "documents_checked")).json().request;
    r = (
      await act(r, "complete", staff, "ตรวจผลทะเบียนตามเอกสาร TEST-456")
    ).json().request;
    expect(r.status).toBe("completed");
    const notification = await prisma.notification.findFirst({
      where: { courseChangeRequestId: r.id, type: "cc_completed" },
    });
    expect(notification?.deliveredLineAt).toBeNull();
    expect((await upload(r, "evidence", staff)).statusCode).toBe(409);
  });
  it("rejects corrupt and over-limit PDFs", async () => {
    await publish();
    let r = (await submit()).json().request;
    expect(
      (
        await upload(
          r,
          "student_petition",
          student,
          Buffer.from("%PDF-not-a-valid-file"),
        )
      ).statusCode,
    ).toBe(422);
    expect(
      (await upload(r, "student_petition", student, Buffer.from("not pdf")))
        .statusCode,
    ).toBe(422);
    expect(
      (
        await upload(
          r,
          "student_petition",
          student,
          Buffer.alloc(5 * 1024 * 1024 + 1),
        )
      ).statusCode,
    ).toBe(413);
  });
  it("keeps signed originals intact and refuses to merge a digital-signature field", async () => {
    await publish();
    let r = (await submit()).json().request;
    r = (await act(r, "review")).json().request;
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const field = doc.getForm().createTextField("signature");
    field.addToPage(page);
    field.acroField.dict.set(PDFName.of("FT"), PDFName.of("Sig"));
    const signed = Buffer.from(await doc.save());
    r = (await upload(r, "signed_petition", staff, signed)).json().request;
    r = (await act(r, "return_signed")).json().request;
    r = (await upload(r, "reg_petition", student)).json().request;
    const merged = await post(`/requests/${r.id}/merge`, student, {
      revision: r.revision,
      ids: r.files.map((f: { id: string }) => f.id),
    });
    expect(merged.statusCode).toBe(422);
    const original = await get(`/requests/${r.id}/files/${r.files[0].id}`);
    expect(original.rawPayload.equals(signed)).toBe(true);
  });
  it("makes registrar handoff a separate recorded step with reference", async () => {
    await publish({
      flow: "program_registrar",
      needsSignature: false,
      needsReg: false,
      needsPi: false,
      needsMerge: false,
    });
    let r = (await submit()).json().request;
    r = (await act(r, "review")).json().request;
    expect(r.phase).toBe("ready_registrar");
    expect((await act(r, "complete")).statusCode).toBe(409);
    r = (await act(r, "registrar_sent")).json().request;
    expect(r.phase).toBe("awaiting_result");
    expect(
      r.events.some(
        (e: { eventType: string }) => e.eventType === "forwarded_to_registrar",
      ),
    ).toBe(false);
  });
});

describe("signature batch handoff", () => {
  async function twoRequests(section = "101") {
    await publish();
    const otherStudent = await prisma.user.findUniqueOrThrow({
      where: { email: "student2@cedt.edu" },
    });
    await prisma.enrollment.create({
      data: { studentId: otherStudent.id, termId, courseId, section },
    });
    let one = (await submit()).json().request;
    let two = (
      await post("/requests", other, {
        courseId,
        requestType: "withdraw",
        reason: "TEST second student",
      })
    ).json().request;
    one = (await act(one, "review")).json().request;
    two = (await act(two, "review")).json().request;
    return [one, two];
  }
  const body = (rows: { id: string; revision: number }[]) => ({
    id: randomUUID(),
    items: rows.map((r) => ({ id: r.id, revision: r.revision })),
    recipient: "TEST ผู้ลงนาม",
    sentOn: "2026-09-30",
    note: "TEST ส่งผ่านช่องทางภายนอกแล้ว",
  });
  it("creates an immutable batch once across concurrent retries, without approving or resetting phase time", async () => {
    const rows = await twoRequests();
    const input = body(rows);
    const results = await Promise.all([
      post("/signature-batches", staff, input),
      post("/signature-batches", staff, input),
    ]);
    expect(results.map((r) => r.statusCode)).toEqual([200, 200]);
    expect(results[0].json()).toMatchObject({
      id: input.id,
      pendingCount: 2,
      returnedCount: 0,
    });
    expect(
      await prisma.courseChangeSignatureBatch.count({ where: { courseId } }),
    ).toBe(1);
    for (const r of rows) {
      const after = (await get(`/requests/${r.id}`, staff)).json().request;
      expect(after.phase).toBe("awaiting_signature");
      expect(after.revision).toBe(r.revision + 1);
      expect(after.phaseSince).toBe(r.phaseSince);
      expect(
        after.events.filter(
          (e: { payload?: { batchId?: string } }) =>
            e.payload?.batchId === input.id,
        ),
      ).toHaveLength(1);
    }
    expect(
      (
        await post("/signature-batches", staff, {
          ...input,
          recipient: "changed destination",
        })
      ).statusCode,
    ).toBe(409);
  });
  it("does not update any member when one revision is stale", async () => {
    const rows = await twoRequests();
    const input = body(rows);
    input.items[1]!.revision += 1;
    expect((await post("/signature-batches", staff, input)).statusCode).toBe(
      409,
    );
    expect(
      await prisma.courseChangeSignatureBatch.count({ where: { courseId } }),
    ).toBe(0);
    for (const r of rows)
      expect((await get(`/requests/${r.id}`, staff)).json().request.revision).toBe(
        r.revision,
      );
  });
  it("rejects mixed Sections, duplicate members and future dispatch dates", async () => {
    const rows = await twoRequests("102");
    expect(
      (await post("/signature-batches", staff, body(rows))).statusCode,
    ).toBe(422);
    expect(
      (await post("/signature-batches", staff, body([rows[0], rows[0]])))
        .statusCode,
    ).toBe(422);
    expect(
      (
        await post("/signature-batches", staff, {
          ...body([rows[0]]),
          sentOn: "2026-10-01",
        })
      ).statusCode,
    ).toBe(422);
  });
  it("keeps batch lists, individual receipts and creation staff-only", async () => {
    const rows = await twoRequests();
    const input = body(rows);
    expect((await post("/signature-batches", student, input)).statusCode).toBe(
      403,
    );
    await post("/signature-batches", staff, input);
    expect((await get("/signature-batches", student)).statusCode).toBe(403);
    expect(
      (await get(`/signature-batches/${input.id}`, student)).statusCode,
    ).toBe(403);
    expect(
      (await get(`/signature-batches/${input.id}`, staff)).json().summary,
    ).toHaveLength(2);
  });
  it("tracks outstanding returned documents separately from recording dispatch", async () => {
    let [r] = await twoRequests();
    const batch = body([r]);
    await post("/signature-batches", staff, batch);
    r = (await get(`/requests/${r.id}`, staff)).json().request;
    r = (await upload(r, "signed_petition")).json().request;
    r = (await act(r, "return_signed")).json().request;
    expect(
      (await get(`/signature-batches/${batch.id}`, staff)).json(),
    ).toMatchObject({ pendingCount: 0, returnedCount: 1 });
  });
});
