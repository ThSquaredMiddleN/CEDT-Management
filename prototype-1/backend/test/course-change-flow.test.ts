import { submitLegacyRequest } from "../src/modules/course-change/service.js";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { config } from "../src/config.js";

/**
 * Course Change integration test (DESIGN.md §11) against the isolated test database (see
 * vitest.config.ts; prepare it with `npm run test:prepare`). "Today" is pinned to 2026-09-30 = week 9 (vitest.config.ts), so
 * drop → Flow C (programme → สนท.) and withdraw → Flow B (advisor → document → PI).
 *
 * Every request created here is deleted in afterAll, so the test is re-runnable.
 */

let app: FastifyInstance;
// Synthetic demo enrollments from prisma/seed-course-change.ts (real CEDT catalog codes).
let student: string; // student3 — free courses include 2110252, 2110204
let otherStudent: string; // student2
let advisor: string; // Dr. Anucha — student3's advisor
let courses: Record<string, string>;
const created: string[] = [];

async function login(email: string, password: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: { "x-requested-with": "XMLHttpRequest" },
    payload: { email, password },
  });
  expect(res.statusCode).toBe(200);
  const cookie = res.cookies.find((c) => c.name === "labsync_session");
  return `labsync_session=${cookie!.value}`;
}

const post = (url: string, cookie: string, payload?: unknown) =>
  app.inject({
    method: "POST",
    url: `/api/v1${url}`,
    headers: { cookie, "x-requested-with": "XMLHttpRequest" },
    payload: payload ?? {},
  });

const get = (url: string, cookie: string) =>
  app.inject({ method: "GET", url: `/api/v1${url}`, headers: { cookie } });

async function submit(cookie: string, requestType: "drop" | "withdraw", code: string, reason: string): Promise<{statusCode:number;json:()=>any}> {
  // Historical v1 engine compatibility. New HTTP submissions are covered in workflow.test.ts.
  const email = cookie === student ? "student3@cedt.edu" : "student2@cedt.edu";
  const me = await prisma.user.findUniqueOrThrow({ where: { email } });
  let res: {statusCode:number;json:()=>any};
  try { const request = await submitLegacyRequest({requestType,courseId:courses[code]!,reason},me,config.COURSE_CHANGE_TODAY!); res = { statusCode:201, json:()=>({request}) }; }
  catch(e) { const error=e as {statusCode:number;code:string;message:string}; res={statusCode:error.statusCode,json:()=>({error:{code:error.code,message:error.message}})}; }
  if(res.statusCode===201) created.push((res.json() as {request:{id:string}}).request.id);
  return res;
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  student = await login("student3@cedt.edu", "student1234");
  otherStudent = await login("student2@cedt.edu", "student1234");
  advisor = await login("anucha@cedt.edu", "instr1234");

  const rows = await prisma.course.findMany({ select: { id: true, code: true } });
  courses = Object.fromEntries(rows.map((c) => [c.code, c.id]));

  const activeTerm = await prisma.term.findFirstOrThrow({where:{isActive:true}});
  await prisma.courseChangeSchedule.create({data:{termId:activeTerm.id,courseId:courses["2110582"]!,section:"*",requestType:"drop",label:"TEST stale preview",format:"block",opensOn:new Date("2026-09-14"),closesOn:new Date("2026-12-06"),flow:"program_registrar",needsSignature:true,needsReg:false,needsPi:false,needsMerge:false,published:true}});
  // Clear anything a previous, crashed run of this test left behind on the courses it uses.
  const s3 = await prisma.user.findUniqueOrThrow({ where: { email: "student3@cedt.edu" } });
  await prisma.courseChangeRequest.deleteMany({
    where: {
      studentId: s3.id,
      courseId: { in: [courses["2110252"]!, courses["2110204"]!] },
    },
  });
});

afterAll(async () => {
  await prisma.courseChangeSchedule.deleteMany({where:{label:"TEST stale preview"}});
  await prisma.courseChangeRequest.deleteMany({ where: { id: { in: created } } });
  await app.close();
  await prisma.$disconnect();
});

describe("Smart Timeline Detection", () => {
  it("routes week 9: drop → Flow C, withdraw → Flow B (deadline end of week 12)", async () => {
    const res = await get("/course-change/context", student);
    expect(res.statusCode).toBe(200);
    const ctx = res.json();
    expect(ctx.week).toBe(9);
    expect(ctx.open.drop.flow).toBe("program_registrar");
    expect(ctx.open.withdraw.flow).toBe("advisor_pi");
    expect(ctx.open.withdraw.closesOn).toBe("2026-10-25");
  });
});

describe("Historical v1 Flow B — withdraw in week 9", () => {
  let id: string;

  it("submits as pending advisor approval and notifies the advisor", async () => {
    const res = await submit(student, "withdraw", "2110252", "ป่วย <b>หนัก</b> ตามเนื้อหาไม่ทัน");
    expect(res.statusCode).toBe(201);
    const r = res.json().request;
    id = r.id;
    expect(r.requestNo).toMatch(/^CR-\d{4}-\d{5}$/);
    expect(r).toMatchObject({ status: "pending_approval", flow: "advisor_pi", weekNo: 9 });
    expect(r.steps.map((s: { state: string }) => s.state)).toEqual([
      "done", "current", "upcoming", "upcoming", "upcoming",
    ]);

    const n = await prisma.notification.findFirst({
      where: { courseChangeRequestId: id, type: "cc_submitted" },
      include: { user: true },
    });
    expect(n?.user.email).toBe("anucha@cedt.edu");
  });

  it("refuses a second live request for the same course (CC-BR-2)", async () => {
    const res = await submit(student, "drop", "2110252", "ลองยื่นซ้ำอีกครั้ง");
    expect(res.statusCode).toBe(409);
  });

  it("keeps students out of staff actions and other students' requests (CC-BR-10)", async () => {
    expect((await post(`/course-change/requests/${id}/approve`, student)).statusCode).toBe(403);
    expect((await get(`/course-change/requests/${id}`, otherStudent)).statusCode).toBe(404);
    expect((await get("/bookings", student)).statusCode).toBe(403);
  });

  it("on approval generates the sealed document and hands off to Reg Chula + PI (CC-BR-7)", async () => {
    const res = await post(`/course-change/requests/${id}/approve`, advisor);
    expect(res.statusCode).toBe(200);
    const r = res.json().request;
    expect(r.status).toBe("processing");
    expect(r.hasDocument).toBe(true);
    expect(r.documentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.regChulaRef).toBe(`REG-${r.requestNo}`);
    expect(r.piRef).toBe(`PI-${r.requestNo}`);
    expect(r.steps.map((s: { state: string }) => s.state)).toEqual([
      "done", "done", "done", "done", "current",
    ]);

    // The student got an in-app notification that was also pushed to LINE (mock).
    const n = await prisma.notification.findFirst({
      where: { courseChangeRequestId: id, type: "cc_approved" },
    });
    expect(n?.deliveredLineAt).not.toBeNull();
  });

  it("serves the merged document to its owner, escaped and verified", async () => {
    const res = await get(`/course-change/requests/${id}/document`, student);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.body).toContain("ฉบับพระเกี้ยว");
    expect(res.body).toContain("ฉบับเกียร์");
    expect(res.body).toContain("ตรวจสอบแล้ว");
    expect(res.body).toContain("&lt;b&gt;หนัก&lt;/b&gt;");
    expect(res.body).not.toContain("<b>หนัก</b>");
  });

  it("cannot be approved twice, then completes when the registry confirms", async () => {
    expect((await post(`/course-change/requests/${id}/approve`, advisor)).statusCode).toBe(409);
    const res = await post(`/course-change/requests/${id}/complete`, advisor, { note: "ok" });
    expect(res.statusCode).toBe(200);
    expect(res.json().request.status).toBe("completed");
  });
});

describe("Historical v1 Flow C — drop in week 9", () => {
  it("needs a reason to reject, and the student can retry afterwards", async () => {
    const first = await submit(student, "drop", "2110204", "ตารางเรียนชนกับวิชาบังคับ");
    expect(first.statusCode).toBe(201);
    const r = first.json().request;
    expect(r).toMatchObject({ status: "pending_approval", flow: "program_registrar" });

    expect((await post(`/course-change/requests/${r.id}/reject`, advisor, { reason: "" })).statusCode).toBe(422);
    const rejected = await post(`/course-change/requests/${r.id}/reject`, advisor, {
      reason: "ขอเอกสารเพิ่มเติม",
    });
    expect(rejected.json().request).toMatchObject({ status: "rejected", rejectReason: "ขอเอกสารเพิ่มเติม" });

    // A rejection frees the course again (the partial unique index ignores rejected rows).
    const retry = await submit(student, "drop", "2110204", "ยื่นใหม่พร้อมเอกสารประกอบ");
    expect(retry.statusCode).toBe(201);
  });
});

describe("cancel (CC-BR-5)", () => {
  it("lets the owner cancel only while pending", async () => {
    const mine = (await get("/course-change/requests?status=pending_approval", student)).json();
    const target = mine.items.find((r: { courseCode: string }) => r.courseCode === "2110204");
    expect(target).toBeTruthy();

    expect((await post(`/course-change/requests/${target.id}/cancel`, otherStudent)).statusCode).toBe(404);
    const res = await post(`/course-change/requests/${target.id}/cancel`, student);
    expect(res.json().request.status).toBe("cancelled");
    expect((await post(`/course-change/requests/${target.id}/cancel`, student)).statusCode).toBe(409);
  });
});

describe("eligibility (CC-BR-1)", () => {
  it("rejects a course the student is not enrolled in", async () => {
    // 2110356 belongs to student2's synthetic enrollments, not student3's.
    const notEnrolled = await submit(student, "withdraw", "2110356", "ไม่ได้ลงทะเบียนวิชานี้");
    expect(notEnrolled.statusCode).toBe(422);
  });
});

describe("additional workflow paths", () => {
  it("runs Flow A end to end without approval, then waits for a staff result", async () => {
    const original = config.COURSE_CHANGE_TODAY;
    try {
      config.COURSE_CHANGE_TODAY = "2026-08-20";
      const res = await submit(student, "drop", "2110204", "ทดสอบเส้นทางส่งตรงช่วงต้นเทอม");
      expect(res.statusCode).toBe(201);
      const r = res.json().request;
      expect(r).toMatchObject({ flow: "reg_direct", status: "processing", hasDocument: false });
      expect(r.regChulaRef).toBe(`REG-${r.requestNo}`);
      expect(r.steps.map((s: { state: string }) => s.state)).toEqual(["done", "done", "current"]);
      expect((await post(`/course-change/requests/${r.id}/cancel`, student)).statusCode).toBe(409);
      const done = await post(`/course-change/requests/${r.id}/complete`, advisor, { note: "ผลจำลอง" });
      expect(done.json().request.status).toBe("completed");
    } finally { config.COURSE_CHANGE_TODAY = original; }
  });

  it("rejects an outdated route preview instead of silently using another flow", async () => {
    const ctx = (await get("/course-change/context", student)).json();
    const res = await post("/course-change/requests", student, {
      requestType: "drop", courseId: courses["2110582"], reason: "ตรวจสอบเส้นทางก่อนยื่น",
      routePreview: { termId: ctx.term.id, flow: "reg_direct", opensOn: "2026-08-03", closesOn: "2026-09-13" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.message).toContain("เส้นทางคำร้องเปลี่ยน");
  });

  it("runs Flow C approval and completion while reporting a bulk failure per request", async () => {
    const res = await submit(student, "drop", "2110582", "ทดสอบหลักสูตรพิจารณาแล้วบันทึกผล");
    expect(res.statusCode).toBe(201);
    const r = res.json().request;
    const missing = "00000000-0000-4000-8000-000000000001";
    const bulk = await post("/course-change/requests/bulk-approve", advisor, { ids: [r.id, missing] });
    expect(bulk.statusCode).toBe(200);
    expect(bulk.json().results).toEqual([
      { id: r.id, ok: true }, { id: missing, ok: false, message: expect.any(String) },
    ]);
    const processing = (await get(`/course-change/requests/${r.id}`, student)).json().request;
    expect(processing).toMatchObject({ flow: "program_registrar", status: "processing", hasDocument: false });
    expect(processing.events.some((e: { eventType: string }) => e.eventType === "forwarded_to_registrar")).toBe(true);
    expect((await post(`/course-change/requests/${r.id}/complete`, advisor)).json().request.status).toBe("completed");
  });

  it("only allows one of two concurrent approvals to change the request", async () => {
    const res = await submit(student, "drop", "5500203", "ตรวจสอบกรณีเจ้าหน้าที่อนุมัติพร้อมกัน");
    expect(res.statusCode).toBe(201);
    const id = res.json().request.id;
    const results = await Promise.all([post(`/course-change/requests/${id}/approve`, advisor), post(`/course-change/requests/${id}/approve`, advisor)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(await prisma.courseChangeEvent.count({ where: { requestId: id, eventType: "approved" } })).toBe(1);
  });

  it("rejects a request after the final deadline", async () => {
    const original = config.COURSE_CHANGE_TODAY;
    try {
      config.COURSE_CHANGE_TODAY = "2026-12-07";
      const res = await submit(student, "withdraw", "2110204", "ยื่นหลังปิดรับคำร้อง");
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("WINDOW_CLOSED");
    } finally { config.COURSE_CHANGE_TODAY = original; }
  });
});
