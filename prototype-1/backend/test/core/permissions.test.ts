import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { can, loadPermissions, loadSessionUser, usersWithPermission } from "../../src/core/permissions.js";
import { prisma } from "../../src/db.js";
import { idOf } from "../helpers/session.js";

let norole: string;

beforeAll(async () => {
  norole = await idOf(prisma, "norole@test.local");
});

afterAll(async () => {
  await prisma.userPermission.deleteMany({ where: { userId: norole } });
  await prisma.userRoleAssignment.deleteMany({ where: { userId: norole } });
  await prisma.role.updateMany({ where: { key: "teacher" }, data: { isActive: true } });
  await prisma.$disconnect();
});

describe("can", () => {
  it("matches names exactly, with no hierarchy", () => {
    const u = { permissions: ["bookings.manage"] };
    expect(can(u, "bookings.manage")).toBe(true);
    expect(can(u, "bookings.view")).toBe(false);
    expect(can(null, "bookings.manage")).toBe(false);
  });
});

describe("loadPermissions", () => {
  it("gives the student role automatically to a user with a student number", async () => {
    const s = await loadSessionUser(await idOf(prisma, "student@test.local"));
    expect(s?.isStudent).toBe(true);
    expect(s?.permissions).toContain("course_change.use");
  });

  it("returns the permissions of assigned roles", async () => {
    const perms = await loadPermissions(await idOf(prisma, "teacher@test.local"), null);
    expect(perms).toEqual(["bookings.use", "course_change.manage.advise", "course_change.view", "line.use"]);
  });

  it("returns nothing for a user with no role and no student number", async () => {
    expect(await loadPermissions(norole, null)).toEqual([]);
  });

  it("adds direct permissions, and merges a permission given twice", async () => {
    const teacher = await prisma.role.findUniqueOrThrow({ where: { key: "teacher" } });
    await prisma.userRoleAssignment.create({ data: { userId: norole, roleId: teacher.id } });
    await prisma.userPermission.createMany({
      data: [
        { userId: norole, permission: "receipts.view", reason: "test" },
        { userId: norole, permission: "bookings.use", reason: "test" },
      ],
    });
    const perms = await loadPermissions(norole, null);
    expect(perms.filter((p) => p === "bookings.use")).toHaveLength(1);
    expect(perms).toContain("receipts.view");
    await prisma.userPermission.deleteMany({ where: { userId: norole } });
    await prisma.userRoleAssignment.deleteMany({ where: { userId: norole } });
  });

  it("ignores inactive roles", async () => {
    await prisma.role.update({ where: { key: "teacher" }, data: { isActive: false } });
    expect(await loadPermissions(await idOf(prisma, "teacher@test.local"), null)).toEqual([]);
    await prisma.role.update({ where: { key: "teacher" }, data: { isActive: true } });
  });
});

describe("loadSessionUser", () => {
  it("returns null for an unknown user", async () => {
    expect(await loadSessionUser("4f6b2c1e-8a3d-4e5f-9b7c-1d2e3f4a5b6c")).toBeNull();
  });
});

describe("usersWithPermission", () => {
  it("includes role holders and, when the student role has it, every student", async () => {
    const managers = await usersWithPermission("course_change.manage");
    expect(managers).toContain(await idOf(prisma, "staff@test.local"));
    expect(managers).not.toContain(await idOf(prisma, "teacher@test.local"));

    const users = await usersWithPermission("course_change.use");
    expect(users).toContain(await idOf(prisma, "student@test.local"));
    expect(users).not.toContain(norole);
  });
});
