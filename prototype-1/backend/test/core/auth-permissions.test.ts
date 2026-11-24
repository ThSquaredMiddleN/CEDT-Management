import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { prisma } from "../../src/db.js";
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
