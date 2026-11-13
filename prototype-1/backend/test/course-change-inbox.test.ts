import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db.js";

let app: FastifyInstance;
let staff: string;
let student: string;
let courseId: string;
let termId: string;
const prefix = "CR-INBOX-REVIEW-";

async function login(email: string, password: string) {
  const res = await app.inject({ method: "POST", url: "/api/v1/auth/login",
    headers: { "x-requested-with": "XMLHttpRequest" }, payload: { email, password } });
  expect(res.statusCode).toBe(200);
  return `labsync_session=${res.cookies.find((c) => c.name === "labsync_session")!.value}`;
}

beforeAll(async () => {
  app = await buildApp();
  staff = await login("admin@cedt.edu", "admin1234");
  student = await login("student3@cedt.edu", "student1234");
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: "student3@cedt.edu" } });
  const term = await prisma.term.findFirstOrThrow({ where: { isActive: true } });
  termId = term.id;
  const course = await prisma.course.create({ data: { code: "CC-INBOX-REVIEW", name: "Inbox review fixture" } });
  courseId = course.id;
  const snapshot = { studentName: owner.name, studentNo: owner.studentNo, courseCode: course.code,
    courseName: course.name, section: null, credits: null, advisorId: owner.advisorId,
    advisorName: "test", termLabel: "test" };
  await prisma.courseChangeRequest.createMany({ data: Array.from({ length: 206 }, (_, i) => ({
    requestNo: `${prefix}${String(i).padStart(3, "0")}`, studentId: owner.id,
    termId: term.id, courseId, requestType: "drop", flow: "program_registrar",
    weekNo: 9, status: i === 0 ? "pending_approval" : "cancelled", reason: "inbox regression",
    snapshot, createdAt: new Date(Date.UTC(2026, 8, 1, 0, i)),
  })) });
});

afterAll(async () => {
  if (courseId) {
    await prisma.courseChangeRequest.deleteMany({ where: { courseId } });
    await prisma.course.delete({ where: { id: courseId } });
  }
  await app?.close();
  await prisma.$disconnect();
});

const list = (query: string, cookie = staff) => app.inject({ method: "GET",
  url: `/api/v1/course-change/requests?${query}`, headers: { cookie } });

describe("Course Change inbox pagination", () => {
  it("groups the full result by course and term, independent of page size", async () => {
    const res = await app.inject({ method: "GET", url: `/api/v1/course-change/request-groups?search=${prefix}&pageSize=1`, headers: { cookie: staff } });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toMatchObject([{ courseId, termId, count: 206, courseCode: "CC-INBOX-REVIEW" }]);
    const pending = await list(`search=${prefix}&courseId=${courseId}&termId=${termId}&status=pending_approval`);
    expect(pending.json().pagination.total).toBe(1);
    const otherTerm = await list(`search=${prefix}&courseId=${courseId}&termId=00000000-0000-4000-8000-000000000001`);
    expect(otherTerm.json().pagination.total).toBe(0);
  });

  it("does not expose staff course-group summaries to students", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/course-change/request-groups", headers: { cookie: student } });
    expect(res.statusCode).toBe(403);
  });

  it("finds an older pending request beyond the latest 200 rows", async () => {
    const res = await list(`search=${prefix}&status=pending_approval&page=1&pageSize=10`);
    expect(res.statusCode).toBe(200);
    expect(res.json().items.map((r: { requestNo: string }) => r.requestNo)).toEqual([`${prefix}000`]);
    expect(res.json().pagination).toMatchObject({ total: 1, totalPages: 1 });
    expect(res.json().counts).toMatchObject({ pending_approval: 1, cancelled: 205 });
  });

  it("returns stable non-overlapping pages with global counts", async () => {
    const first = (await list(`search=${prefix}&page=1&pageSize=100`)).json();
    const second = (await list(`search=${prefix}&page=2&pageSize=100`)).json();
    const third = (await list(`search=${prefix}&page=3&pageSize=100`)).json();
    expect(first.items).toHaveLength(100);
    expect(second.items).toHaveLength(100);
    expect(third.items).toHaveLength(6);
    expect(new Set([...first.items, ...second.items, ...third.items].map((r) => r.id)).size).toBe(206);
    expect(first.pagination).toMatchObject({ total: 206, totalPages: 3 });
  });

  it("supports the closed tab and preserves student ownership", async () => {
    const done = (await list(`search=${prefix}&status=done&pageSize=10`)).json();
    expect(done.pagination.total).toBe(205);
    expect(done.items.every((r: { status: string }) => r.status === "cancelled")).toBe(true);
    const mine = (await list(`search=${prefix}&pageSize=100`, student)).json();
    expect(mine.pagination.total).toBe(206);
    const other = await login("student2@cedt.edu", "student1234");
    expect((await list(`search=${prefix}`, other)).json().pagination.total).toBe(0);
  });

  it.each(["page=0", "pageSize=101", "page=-1"])("rejects invalid paging: %s", async (query) => {
    expect((await list(query)).statusCode).toBe(422);
  });
});
