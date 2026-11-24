import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import { PDFDocument } from "pdf-lib";
import { registerAuth } from "../../src/plugins/auth.js";
import { loginAs } from "../helpers/session.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("/auth/me", () => {
  it("returns studentNo, isStudent and permissions", async () => {
    const cookie = await loginAs(app, "student@test.local");
    const res = await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: { cookie } });
    expect(res.json().user).toMatchObject({ studentNo: "6800000001", isStudent: true });
    expect(res.json().user.permissions).toContain("course_change.use");
  });

  it("keeps the old staff able to reach the admin pages (has .view permissions)", async () => {
    const cookie = await loginAs(app, "admin@cedt.edu", "admin1234");
    const res = await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: { cookie } });
    const perms: string[] = res.json().user.permissions;
    for (const p of ["announcements.view", "news.view", "bookings.view", "receipts.view", "course_change.view", "core.permissions.manage"]) {
      expect(perms).toContain(p);
    }
  });
});

describe("route declarations", () => {
  const build = () => {
    const a = Fastify();
    registerAuth(a, new Set(["x.manage"]));
    return a;
  };

  it("refuses to start when a non-public route that changes data has no permission", async () => {
    const a = build();
    await expect(async () => {
      a.post("/api/v1/x", { config: { auth: "user" } }, async () => ({}));
      await a.ready();
    }).rejects.toThrow(/config\.permission/);
  });

  it("accepts permission: null for own-data routes", async () => {
    const a = build();
    a.post("/api/v1/x", { config: { auth: "user", permission: null } }, async () => ({}));
    await expect(a.ready()).resolves.toBeDefined();
    await a.close();
  });

  it("refuses an unknown permission name", async () => {
    const a = build();
    await expect(async () => {
      a.get("/api/v1/x", { config: { auth: "user", permission: "x.typo" } }, async () => ({}));
      await a.ready();
    }).rejects.toThrow(/unknown permission/);
  });
});

describe("permission checks", () => {
  it("401 without a session, 403 without the permission, 200 with it", async () => {
    expect((await app.inject({ method: "GET", url: "/api/v1/receipts" })).statusCode).toBe(401);
    const norole = await loginAs(app, "norole@test.local");
    expect((await app.inject({ method: "GET", url: "/api/v1/receipts", headers: { cookie: norole } })).statusCode).toBe(403);
    const staff = await loginAs(app, "staff@test.local");
    expect((await app.inject({ method: "GET", url: "/api/v1/receipts", headers: { cookie: staff } })).statusCode).toBe(200);
  });

  it("applies a direct permission on the next request and drops it when removed", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "norole@test.local" } });
    const cookie = await loginAs(app, "norole@test.local");
    const get = () => app.inject({ method: "GET", url: "/api/v1/receipts", headers: { cookie } });

    await prisma.userPermission.create({ data: { userId: user.id, permission: "receipts.view", reason: "test" } });
    expect((await get()).statusCode).toBe(200);
    await prisma.userPermission.deleteMany({ where: { userId: user.id } });
    expect((await get()).statusCode).toBe(403);
  });

  it("stops honouring an inactive role", async () => {
    const cookie = await loginAs(app, "audit@test.local");
    const get = () => app.inject({ method: "GET", url: "/api/v1/receipts", headers: { cookie } });
    expect((await get()).statusCode).toBe(200);
    await prisma.role.update({ where: { key: "audit" }, data: { isActive: false } });
    expect((await get()).statusCode).toBe(403);
    await prisma.role.update({ where: { key: "audit" }, data: { isActive: true } });
  });

  it("lets a student use course change but not the staff pages", async () => {
    const student = await loginAs(app, "student@test.local");
    const eligible = await app.inject({ method: "GET", url: "/api/v1/course-change/eligible-courses", headers: { cookie: student } });
    expect(eligible.statusCode).not.toBe(403);
    const settings = await app.inject({ method: "GET", url: "/api/v1/course-change/settings", headers: { cookie: student } });
    expect(settings.statusCode).toBe(403);
  });

  it("lets audit view but not change", async () => {
    const audit = await loginAs(app, "audit@test.local");
    const del = await app.inject({
      method: "DELETE",
      url: "/api/v1/receipts/4f6b2c1e-8a3d-4e5f-9b7c-1d2e3f4a5b6c",
      headers: { cookie: audit, "x-requested-with": "XMLHttpRequest" },
    });
    expect(del.statusCode).toBe(403);
  });

  it("hides another student's course change requests (shared plan 2.6)", async () => {
    const other = await prisma.courseChangeRequest.findFirst({
      where: { student: { email: { not: "student@test.local" } } },
      select: { id: true },
    });
    expect(other).not.toBeNull();
    const student = await loginAs(app, "student@test.local");
    const res = await app.inject({ method: "GET", url: `/api/v1/course-change/requests/${other!.id}`, headers: { cookie: student } });
    expect(res.statusCode).toBe(404);
    const list = await app.inject({ method: "GET", url: "/api/v1/course-change/requests", headers: { cookie: student } });
    expect(JSON.stringify(list.json())).not.toContain(other!.id);
  });
});

describe("drafts are only visible with the module's .view permission", () => {
  it("hides draft announcements and news from a student and a user without roles, shows them to staff", async () => {
    const authorId = (await prisma.user.findUniqueOrThrow({ where: { email: "staff@test.local" } })).id;
    const ann = await prisma.announcement.create({ data: { title: "TEST draft announcement", authorId } });
    const news = await prisma.newsArticle.create({ data: { title: "TEST draft news", authorId } });
    try {
      const cases: [string, boolean][] = [
        ["student@test.local", false],
        ["norole@test.local", false],
        ["staff@test.local", true],
      ];
      for (const [email, sees] of cases) {
        const cookie = await loginAs(app, email);
        const one = (url: string) => app.inject({ method: "GET", url, headers: { cookie } });
        expect((await one(`/api/v1/announcements/${ann.id}`)).statusCode, email).toBe(sees ? 200 : 404);
        expect((await one(`/api/v1/news/${news.id}`)).statusCode, email).toBe(sees ? 200 : 404);
        expect(JSON.stringify((await one("/api/v1/announcements")).json()).includes(ann.id), email).toBe(sees);
        expect(JSON.stringify((await one("/api/v1/news")).json()).includes(news.id), email).toBe(sees);
      }
    } finally {
      await prisma.announcement.delete({ where: { id: ann.id } });
      await prisma.newsArticle.delete({ where: { id: news.id } });
    }
  });
});

describe("booking auto-approval", () => {
  it("leaves a bookings.use request pending and auto-approves a bookings.manage request", async () => {
    const term = await prisma.term.findFirstOrThrow({ where: { isActive: true } });
    const date = "2026-11-26";
    const room = await prisma.room.findFirstOrThrow({
      where: { isActive: true, occurrences: { none: { date: new Date(`${date}T00:00:00Z`) } } },
    });
    const created: string[] = [];
    const book = async (email: string, startTime: string, endTime: string) => {
      const cookie = await loginAs(app, email);
      const instructorId = (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/bookings",
        headers: { cookie, "x-requested-with": "XMLHttpRequest" },
        payload: {
          bookingType: "one_off",
          termId: term.id,
          title: "TEST auto-approval",
          instructorId,
          roomId: room.id,
          oneOffDate: date,
          startTime,
          endTime,
          studentCount: 5,
        },
      });
      expect(res.statusCode, `${email}: ${res.body}`).toBe(201);
      created.push(res.json().booking.id);
      return res.json().booking.status as string;
    };
    try {
      expect(await book("teacher@test.local", "20:00", "20:30")).toBe("pending");
      expect(await book("staff@test.local", "20:30", "21:00")).toBe("approved");
    } finally {
      await prisma.notification.deleteMany({ where: { module: "bookings", subjectId: { in: created } } });
      await prisma.booking.deleteMany({ where: { id: { in: created } } });
    }
  });
});

describe("negative permission checks", () => {
  it("refuses a public route that declares a permission", async () => {
    const a = Fastify();
    registerAuth(a, new Set(["x.manage"]));
    await expect(async () => {
      a.get("/api/v1/x", { config: { auth: "public", permission: "x.manage" } }, async () => ({}));
      await a.ready();
    }).rejects.toThrow(/public but declares a permission/);
  });

  it("hides a booking from a bookings.use holder who neither requested nor teaches it", async () => {
    const teacherId = (await prisma.user.findUniqueOrThrow({ where: { email: "teacher@test.local" } })).id;
    const b = await prisma.booking.findFirstOrThrow({
      where: { status: { in: ["pending", "approved"] }, requestedBy: { not: teacherId }, instructorId: { not: teacherId } },
      select: { id: true, status: true },
    });
    const cookie = await loginAs(app, "teacher@test.local");
    expect((await app.inject({ method: "GET", url: `/api/v1/bookings/${b.id}`, headers: { cookie } })).statusCode).toBe(404);
    const list = await app.inject({ method: "GET", url: "/api/v1/bookings?pageSize=100", headers: { cookie } });
    expect(list.statusCode).toBe(200);
    expect(JSON.stringify(list.json())).not.toContain(b.id);
    const cancel = await app.inject({
      method: "POST",
      url: `/api/v1/bookings/${b.id}/cancel`,
      headers: { cookie, "x-requested-with": "XMLHttpRequest" },
      payload: { reason: "TEST probe" },
    });
    expect(cancel.statusCode).toBe(404);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe(b.status);
  });

  it("refuses workflow actions and uploads from a course_change.view-only user", async () => {
    const original = await prisma.courseChangeRequest.findFirstOrThrow({
      where: { student: { email: { not: "audit@test.local" } } },
      select: { id: true, workflowVersion: true, status: true, phase: true, revision: true },
    });
    // Open v2 request in staff review, so the request checks pass and only the permission check is left.
    await prisma.courseChangeRequest.update({
      where: { id: original.id },
      data: { workflowVersion: 2, status: "pending_approval", phase: "staff_review" },
    });
    try {
      const cookie = await loginAs(app, "audit@test.local");
      const before = {
        files: await prisma.courseChangeFile.count({ where: { requestId: original.id } }),
        events: await prisma.courseChangeEvent.count({ where: { requestId: original.id } }),
      };
      const act = await app.inject({
        method: "POST",
        url: `/api/v1/course-change/requests/${original.id}/workflow`,
        headers: { cookie, "x-requested-with": "XMLHttpRequest" },
        payload: { revision: original.revision, action: "review", note: "TEST audit probe" },
      });
      expect([403, 404]).toContain(act.statusCode);

      const boundary = "test-pdf-boundary";
      const upload = await app.inject({
        method: "POST",
        url: `/api/v1/course-change/requests/${original.id}/files?revision=${original.revision}&kind=evidence`,
        headers: { cookie, "x-requested-with": "XMLHttpRequest", "content-type": `multipart/form-data; boundary=${boundary}` },
        payload: Buffer.concat([
          Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="x.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
          Buffer.from(await (async () => { const d = await PDFDocument.create(); d.addPage(); return d.save(); })()),
          Buffer.from(`\r\n--${boundary}--\r\n`),
        ]),
      });
      expect([403, 404]).toContain(upload.statusCode);

      const after = await prisma.courseChangeRequest.findUniqueOrThrow({ where: { id: original.id }, select: { revision: true, phase: true } });
      expect(after).toEqual({ revision: original.revision, phase: "staff_review" });
      expect(await prisma.courseChangeFile.count({ where: { requestId: original.id } })).toBe(before.files);
      expect(await prisma.courseChangeEvent.count({ where: { requestId: original.id } })).toBe(before.events);
    } finally {
      await prisma.courseChangeRequest.update({
        where: { id: original.id },
        data: { workflowVersion: original.workflowVersion, status: original.status, phase: original.phase },
      });
    }
  });

  it("shows pending bookings on the calendar only to bookings.view / bookings.manage", async () => {
    const occ = await prisma.bookingOccurrence.findFirstOrThrow({
      where: { isCancelled: false, booking: { status: "pending" } },
      select: { date: true, bookingId: true },
    });
    const day = occ.date.toISOString().slice(0, 10);
    const cal = async (email: string) => {
      const cookie = await loginAs(app, email);
      const res = await app.inject({ method: "GET", url: `/api/v1/calendar?from=${day}&to=${day}`, headers: { cookie } });
      expect(res.statusCode).toBe(200);
      return JSON.stringify(res.json());
    };
    expect(await cal("norole@test.local")).not.toContain(occ.bookingId);
    expect(await cal("staff@test.local")).toContain(occ.bookingId);
  });
});
