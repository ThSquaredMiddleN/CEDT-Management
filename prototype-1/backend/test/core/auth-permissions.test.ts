import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { prisma } from "../../src/db.js";
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
