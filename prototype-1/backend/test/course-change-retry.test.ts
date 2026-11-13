import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { config } from "../src/config.js";
import { prisma } from "../src/db.js";

let app: FastifyInstance;
let student: string;
let other: string;
let courseId: string;
const originalToday = config.COURSE_CHANGE_TODAY;

const post = (body: Record<string, unknown>) => app.inject({ method: "POST", url: "/api/v1/course-change/requests",
  headers: { cookie: student, "x-requested-with": "XMLHttpRequest" }, payload: body });
const recover = (key: string, cookie = student) => app.inject({ method: "GET",
  url: `/api/v1/course-change/submissions/${key}`, headers: { cookie } });
const payload = (clientRequestId = randomUUID()) => ({ clientRequestId, requestType: "withdraw", courseId, reason: "ตรวจผลการยื่นหลังสัญญาณขาด" });

beforeAll(async () => {
  app = await buildApp();
  async function login(email: string) {
    const response = await app.inject({ method: "POST", url: "/api/v1/auth/login",
      headers: { "x-requested-with": "XMLHttpRequest" }, payload: { email, password: "student1234" } });
    expect(response.statusCode).toBe(200);
    return `labsync_session=${response.cookies.find((c) => c.name === "labsync_session")!.value}`;
  }
  student = await login("student3@cedt.edu");
  other = await login("student2@cedt.edu");
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: "student3@cedt.edu" } });
  const term = await prisma.term.findFirstOrThrow({ where: { isActive: true } });
  const course = await prisma.course.create({ data: { code: `RETRY-${randomUUID().slice(0, 8)}`, name: "Retry fixture", catalogSource: "test" } });
  courseId = course.id;
  await prisma.courseChangeSchedule.create({data:{termId:term.id,courseId,section:"*",requestType:"withdraw",label:"TEST retry schedule",format:"block",opensOn:new Date("2026-09-01"),closesOn:new Date("2026-10-25"),flow:"advisor_pi",needsSignature:true,needsReg:false,needsPi:true,needsMerge:false,published:true}});
  await prisma.enrollment.create({ data: { studentId: owner.id, termId: term.id, courseId } });
  await prisma.allowedCourse.create({ data: { termId: term.id, courseId, note: "ประกาศประกอบการพิจารณา\nอ่านก่อนยื่นคำร้อง" } });
});

afterEach(async () => {
  config.COURSE_CHANGE_TODAY = originalToday;
  await prisma.courseChangeRequest.deleteMany({ where: { courseId } });
});
afterAll(async () => {
  if (courseId) {
    await prisma.courseChangeSchedule.deleteMany({ where: {courseId} });
    await prisma.enrollment.deleteMany({ where: { courseId } });
    await prisma.allowedCourse.deleteMany({ where: { courseId } });
    await prisma.course.delete({ where: { id: courseId } });
  }
  await app?.close();
  await prisma.$disconnect();
});

describe("submission recovery", () => {
  it("returns one request and one audit/notification set for concurrent retries", async () => {
    const body = payload();
    const results = await Promise.all([post(body), post(body)]);
    expect(results.map((r) => r.statusCode)).toEqual([201, 201]);
    const id = results[0].json().request.id;
    expect(results[1].json().request.id).toBe(id);
    expect(await prisma.courseChangeRequest.count({ where: { courseId } })).toBe(1);
    expect(await prisma.courseChangeEvent.count({ where: { requestId: id, eventType: "submitted" } })).toBe(1);
    expect(await prisma.notification.count({ where: { courseChangeRequestId: id, type: "cc_submitted" } })).toBe(await prisma.user.count({where:{role:"staff",isActive:true}}));
  });
  it("recovers the same request after the deadline instead of submitting again", async () => {
    const body = payload();
    const first = await post(body);
    expect(first.statusCode).toBe(201);
    config.COURSE_CHANGE_TODAY = "2026-12-07";
    const retry = await post(body);
    expect(retry.statusCode).toBe(201);
    expect(retry.json().request.id).toBe(first.json().request.id);
    expect((await recover(body.clientRequestId)).json().request.id).toBe(first.json().request.id);
  });
  it("does not revive a cancelled request when its original submission is retried", async () => {
    const body = payload();
    const first = (await post(body)).json().request;
    await app.inject({ method: "POST", url: `/api/v1/course-change/requests/${first.id}/cancel`,
      headers: { cookie: student, "x-requested-with": "XMLHttpRequest" }, payload: {} });
    const retry = await post(body);
    expect(retry.json().request).toMatchObject({ id: first.id, status: "cancelled" });
    const newSubmission = await post(payload());
    expect(newSubmission.statusCode).toBe(201);
    expect(newSubmission.json().request.id).not.toBe(first.id);
  });
  it("rejects reuse of a submission key for edited content", async () => {
    const body = payload();
    expect((await post(body)).statusCode).toBe(201);
    const changed = await post({ ...body, reason: "แก้เหตุผลและพยายามใช้รหัสเดิม" });
    expect(changed.statusCode).toBe(409);
    expect((await recover(body.clientRequestId)).json().request.reason).toBe(body.reason);
  });
  it("keeps duplicate-course protection when a different key is used", async () => {
    expect((await post(payload())).statusCode).toBe(201);
    expect((await post(payload())).statusCode).toBe(409);
  });
  it("returns no result for an unknown key or another student's key without creating anything", async () => {
    const body = payload();
    expect((await recover(body.clientRequestId)).json()).toEqual({ request: null });
    const first = await post(body);
    expect((await recover(body.clientRequestId, other)).json()).toEqual({ request: null });
    expect((await recover(body.clientRequestId)).json().request.id).toBe(first.json().request.id);
    expect(await prisma.courseChangeRequest.count({ where: { courseId } })).toBe(1);
  });
  it("validates malformed submission ids", async () => {
    expect((await post({ ...payload(), clientRequestId: "bad" })).statusCode).toBe(422);
    expect((await recover("bad")).statusCode).toBe(422);
  });
  it("shows programme notes even when the course is eligible", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/course-change/eligible-courses?type=withdraw", headers: { cookie: student } });
    expect(response.json().items.find((c: { courseId: string }) => c.courseId === courseId)).toMatchObject({
      eligible: true, announcement: "ประกาศประกอบการพิจารณา\nอ่านก่อนยื่นคำร้อง",
    });
  });
});
