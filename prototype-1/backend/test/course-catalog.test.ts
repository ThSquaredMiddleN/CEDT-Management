import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CATALOG_SOURCE, CEDT_COURSE_CATALOG } from "../prisma/data/cedt-course-catalog.js";
import { SYNTHETIC_ENROLLMENT, seedCourseCatalog } from "../prisma/seed-course-change.js";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { eligibleCourses } from "../src/modules/course-change/service.js";
import type { SessionUser } from "../src/plugins/auth.js";

/**
 * DATA-001: the realistic CEDT catalog, synthetic demo enrollments, and Course Change
 * eligibility on top of them (docs/course-change/DATABASE.md). These tests temporarily edit
 * rows (and always restore them), so they refuse to run anywhere but a `*_test` database.
 */

const dbName = new URL(process.env.DATABASE_URL ?? "postgresql://x/none").pathname.slice(1);
if (!dbName.endsWith("_test")) {
  throw new Error(`course-catalog.test.ts must run against a *_test database, not "${dbName}"`);
}

let app: FastifyInstance;
let student3: string;
let staff: string;
let s3: SessionUser;
const created: string[] = [];

async function login(email: string, password: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: { "x-requested-with": "XMLHttpRequest" },
    payload: { email, password },
  });
  expect(res.statusCode).toBe(200);
  return `labsync_session=${res.cookies.find((c) => c.name === "labsync_session")!.value}`;
}

const get = (url: string, cookie: string) =>
  app.inject({ method: "GET", url: `/api/v1${url}`, headers: { cookie } });
const post = (url: string, cookie: string, payload: Record<string, unknown>) =>
  app.inject({
    method: "POST",
    url: `/api/v1${url}`,
    headers: { cookie, "x-requested-with": "XMLHttpRequest" },
    payload,
  });

const courseId = async (code: string) =>
  (await prisma.course.findUniqueOrThrow({ where: { code } })).id;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  student3 = await login("student3@cedt.edu", "student1234");
  staff = await login("admin@cedt.edu", "admin1234");
  const u = await prisma.user.findUniqueOrThrow({ where: { email: "student3@cedt.edu" } });
  const term = await prisma.term.findFirstOrThrow({where:{isActive:true}});
  const enrolled = await prisma.enrollment.findMany({where:{studentId:u.id,termId:term.id}});
  for(const enrollment of enrolled) for(const requestType of ["drop","withdraw"] as const) {
    await prisma.courseChangeSchedule.create({data:{termId:term.id,courseId:enrollment.courseId,section:"*",requestType,label:"TEST catalog published dates",format:"block",opensOn:new Date("2026-09-01"),closesOn:new Date("2026-10-25"),flow:requestType==="drop"?"program_registrar":"advisor_pi",needsSignature:true,needsReg:false,needsPi:requestType==="withdraw",needsMerge:false,published:true}});
  }
  s3 = { id: u.id, name: u.name, email: u.email, role: u.role, titlePrefix: u.titlePrefix, studentNo: u.studentNo };
});

afterAll(async () => {
  await prisma.courseChangeSchedule.deleteMany({where:{label:"TEST catalog published dates"}});
  await prisma.courseChangeRequest.deleteMany({ where: { id: { in: created } } });
  await app.close();
  await prisma.$disconnect();
});

describe("catalog seeding", () => {
  it("stores every catalog course with its exact code and Thai name", async () => {
    const rows = await prisma.course.findMany({ where: { catalogSource: CATALOG_SOURCE } });
    expect(rows).toHaveLength(CEDT_COURSE_CATALOG.length);
    const byCode = new Map(rows.map((r) => [r.code, r.name]));
    for (const c of CEDT_COURSE_CATALOG) expect(byCode.get(c.code)).toBe(c.name);
  });

  it("is idempotent: re-seeding creates nothing and keeps ids stable", async () => {
    const before = await prisma.course.findMany({ orderBy: { code: "asc" } });
    const first = await seedCourseCatalog();
    const second = await seedCourseCatalog();
    expect(first.created).toBe(0);
    expect(second.created).toBe(0);
    const after = await prisma.course.findMany({ orderBy: { code: "asc" } });
    expect(after.map((c) => c.id)).toEqual(before.map((c) => c.id));
  });

  it("does not overwrite a manually edited course name", async () => {
    const id = await courseId("2110322");
    const original = (await prisma.course.findUniqueOrThrow({ where: { id } })).name;
    await prisma.course.update({ where: { id }, data: { name: "ระบบฐานข้อมูล (แก้ไขโดยเจ้าหน้าที่)" } });
    try {
      await seedCourseCatalog();
      const now = await prisma.course.findUniqueOrThrow({ where: { id } });
      expect(now.name).toBe("ระบบฐานข้อมูล (แก้ไขโดยเจ้าหน้าที่)");
    } finally {
      await prisma.course.update({ where: { id }, data: { name: original } });
    }
  });

  it("keeps the legacy LabSync placeholder courses and their bookings intact", async () => {
    const placeholders = await prisma.course.findMany({
      where: { code: { startsWith: "CEDT" } },
      include: { _count: { select: { bookings: true } } },
    });
    expect(placeholders.length).toBeGreaterThan(0);
    expect(placeholders.every((c) => c.catalogSource === null)).toBe(true);
    expect(placeholders.some((c) => c._count.bookings > 0)).toBe(true);
  });
});

describe("duplicate prevention", () => {
  it("rejects a second course with the same code", async () => {
    await expect(
      prisma.course.create({ data: { code: "2110322", name: "dup" } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("rejects a second enrollment for the same student, term and course", async () => {
    const e = await prisma.enrollment.findFirstOrThrow({ where: { studentId: s3.id } });
    await expect(
      prisma.enrollment.create({
        data: { studentId: e.studentId, termId: e.termId, courseId: e.courseId },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("rejects a second live request at the DB level (one_live_course_change)", async () => {
    const live = await prisma.courseChangeRequest.findFirstOrThrow({
      where: { studentId: s3.id, status: "pending_approval" },
    });
    await expect(
      prisma.courseChangeRequest.create({
        data: {
          requestNo: "CR-TEST-DUP",
          studentId: live.studentId,
          termId: live.termId,
          courseId: live.courseId,
          requestType: live.requestType,
          flow: live.flow,
          weekNo: live.weekNo,
          status: "pending_approval",
          reason: "duplicate via direct insert",
          snapshot: {},
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});

describe("synthetic demo enrollments", () => {
  it("link every demo student to catalog courses only, labelled synthetic, with no invented data", async () => {
    for (const email of ["student@cedt.edu", "student2@cedt.edu", "student3@cedt.edu"]) {
      const rows = await prisma.enrollment.findMany({
        where: { student: { email } },
        include: { course: true, term: true },
      });
      expect(rows.length).toBeGreaterThanOrEqual(5);
      for (const r of rows) {
        expect(r.course.catalogSource).toBe(CATALOG_SOURCE);
        expect(r.source).toBe(SYNTHETIC_ENROLLMENT);
        expect(r.section).toBeNull();
        expect(r.credits).toBeNull();
        expect(r.term.isActive).toBe(true);
      }
    }
  });
});

describe("eligibility on the real catalog", () => {
  it("lists student3's catalog courses: some eligible, the ones with live requests blocked", async () => {
    const res = await get("/course-change/eligible-courses?type=withdraw", student3);
    const items = res.json().items as { courseCode: string; eligible: boolean; blockedReason: string | null }[];
    expect(items.every((c) => /^\d{7}$/.test(c.courseCode))).toBe(true);
    expect(items.some((c) => c.eligible)).toBe(true);
    const blocked = items.find((c) => c.courseCode === "2110328")!; // seeded pending withdraw
    expect(blocked.eligible).toBe(false);
    expect(blocked.blockedReason).toContain("CR-");
  });

  it("hides placeholder (non-catalog) enrollments and refuses to submit them", async () => {
    const legacy = await prisma.course.findUniqueOrThrow({ where: { code: "CEDT101" } });
    const term = await prisma.term.findFirstOrThrow({ where: { isActive: true } });
    const e = await prisma.enrollment.create({
      data: { studentId: s3.id, termId: term.id, courseId: legacy.id, source: "test" },
    });
    try {
      const items = (await get("/course-change/eligible-courses?type=drop", student3)).json().items;
      expect(items.some((c: { courseCode: string }) => c.courseCode === "CEDT101")).toBe(false);
      const res = await post("/course-change/requests", student3, {
        requestType: "drop", courseId: legacy.id, reason: "placeholder course",
      });
      expect(res.statusCode).toBe(422);
    } finally {
      await prisma.enrollment.delete({ where: { id: e.id } });
    }
  });

  it("blocks an inactive course in the list and at submit", async () => {
    const id = await courseId("2110582");
    await prisma.course.update({ where: { id }, data: { isActive: false } });
    try {
      const items = (await get("/course-change/eligible-courses?type=drop", student3)).json().items;
      const c = items.find((x: { courseCode: string }) => x.courseCode === "2110582");
      expect(c).toMatchObject({ eligible: false, blockedReason: "รายวิชานี้ถูกปิดใช้งานในระบบ" });
      const res = await post("/course-change/requests", student3, {
        requestType: "drop", courseId: id, reason: "inactive course",
      });
      expect(res.statusCode).toBe(422);
    } finally {
      await prisma.course.update({ where: { id }, data: { isActive: true } });
    }
  });

  it("respects the per-type announcement (allowWithdraw = false)", async () => {
    const id = await courseId("5500203");
    const term = await prisma.term.findFirstOrThrow({ where: { isActive: true } });
    const key = { termId_courseId: { termId: term.id, courseId: id } };
    await prisma.allowedCourse.update({ where: key, data: { allowWithdraw: false } });
    try {
      const w = (await get("/course-change/eligible-courses?type=withdraw", student3)).json().items;
      const d = (await get("/course-change/eligible-courses?type=drop", student3)).json().items;
      const pick = (xs: { courseCode: string; eligible: boolean }[]) => xs.find((x) => x.courseCode === "5500203")!;
      expect(pick(w).eligible).toBe(false);
      expect(pick(d).eligible).toBe(true);
    } finally {
      await prisma.allowedCourse.update({ where: key, data: { allowWithdraw: true } });
    }
  });

  it("marks everything blocked when the workflow window is closed", async () => {
    // Week 1 (2026-08-05): withdraw has no window yet.
    const { items } = await eligibleCourses(s3, "withdraw", "2026-08-05");
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((c) => !c.eligible)).toBe(true);
  });
});

describe("student and staff see the same course data", () => {
  it("shows the catalog code and Thai name on both portals for a new request", async () => {
    const id = await courseId("5500203");
    const db = await prisma.course.findUniqueOrThrow({ where: { id } });

    const sub = await post("/course-change/requests", student3, {
      requestType: "withdraw", courseId: id, reason: "ตรวจสอบข้อมูลรายวิชาจริง",
    });
    expect(sub.statusCode).toBe(201);
    const r = sub.json().request;
    created.push(r.id);
    expect(r).toMatchObject({ courseCode: db.code, courseName: db.name, section: null, credits: null });

    const staffList = (await get("/course-change/requests", staff)).json().items;
    const seen = staffList.find((x: { id: string }) => x.id === r.id);
    expect(seen).toMatchObject({ courseCode: "5500203", courseName: db.name });
  });
});

describe("shared LabSync compatibility", () => {
  it("still serves the LabSync course list, including the placeholder booking courses", async () => {
    const res = await get("/courses?active=all", staff);
    expect(res.statusCode).toBe(200);
    const codes = res.json().items.map((c: { code: string }) => c.code);
    expect(codes).toContain("CEDT101");
    expect(codes).toContain("2110322");
  });
});
