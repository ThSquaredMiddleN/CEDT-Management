import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRole, getUserAccess, saveUserAccess, updateRole } from "../../src/core/access.js";
import { buildCatalogRows, parsePermission } from "../../src/core/permission-layout.js";
import { loadSessionUser, type SessionUser } from "../../src/core/permissions.js";
import { prisma } from "../../src/db.js";
import { permissionCatalog, permissionRowLabels } from "../../src/modules/index.js";
import { idOf } from "../helpers/session.js";

describe("parsePermission", () => {
  it("splits row, level and part", () => {
    expect(parsePermission("course_change.manage.advise")).toEqual({ row: "course_change", level: "manage", part: "advise" });
    expect(parsePermission("core.users.view")).toEqual({ row: "core.users", level: "view", part: null });
    expect(parsePermission("bookings.use")).toEqual({ row: "bookings", level: "use", part: null });
  });

  it("rejects names without a level or with a part on use/view", () => {
    expect(parsePermission("core.import")).toBeNull();
    expect(parsePermission("bookings.view.extra")).toBeNull();
    expect(parsePermission("view")).toBeNull();
  });

  it("parses every declared permission", () => {
    expect(permissionCatalog.filter((p) => parsePermission(p.key) === null).map((p) => p.key)).toEqual([]);
  });
});

describe("buildCatalogRows", () => {
  it("groups by row with Thai labels and manage parts", () => {
    const rows = buildCatalogRows(permissionCatalog, permissionRowLabels);
    const cc = rows.find((r) => r.row === "course_change")!;
    expect(cc.label).toBe("ลด-ถอนรายวิชา");
    expect(cc.use?.key).toBe("course_change.use");
    expect(cc.manage?.key).toBe("course_change.manage");
    expect(cc.manage?.parts.map((p) => p.key)).toEqual(["course_change.manage.advise"]);
    expect(rows.find((r) => r.row === "line")!.view).toBeUndefined();
  });
});

const known = new Set(permissionCatalog.map((p) => p.key));
let itadmin: SessionUser;
let norole: string;
const roleId = async (key: string) => (await prisma.role.findUniqueOrThrow({ where: { key } })).id;

beforeAll(async () => {
  itadmin = (await loadSessionUser(await idOf(prisma, "itadmin@test.local")))!;
  norole = await idOf(prisma, "norole@test.local");
});

afterAll(async () => {
  await prisma.userPermission.deleteMany({ where: { userId: norole } });
  await prisma.userRoleAssignment.deleteMany({ where: { userId: norole } });
  await prisma.rolePermission.deleteMany({ where: { role: { key: { startsWith: "test_" } } } });
  await prisma.role.updateMany({ where: { key: { startsWith: "test_" } }, data: { isActive: false } });
  await prisma.$disconnect();
});

describe("saveUserAccess", () => {
  it("applies roles and direct permissions in one save, with one change entry per change", async () => {
    // itadmin@test.local holds only it_admin's permissions, so it can give it_admin and core.* only.
    const { access, changes } = await saveUserAccess(
      itadmin,
      norole,
      { roleIds: [await roleId("it_admin")], permissions: ["core.users.manage"], reason: "ทดสอบ" },
      known,
    );
    expect(access.roles.map((r) => r.key)).toEqual(["it_admin"]);
    expect(access.direct.map((d) => [d.permission, d.reason])).toEqual([["core.users.manage", "ทดสอบ"]]);
    expect(changes.map((c) => c.action).sort()).toEqual(["core.permission.granted", "core.role.assigned"]);
    expect(changes.every((c) => c.note === "ทดสอบ" && c.subjectId === norole)).toBe(true);

    const again = await saveUserAccess(itadmin, norole, { roleIds: [await roleId("it_admin")], permissions: ["core.users.manage"], reason: "" }, known);
    expect(again.changes).toEqual([]);
  });

  it("keeps the reason of unchanged direct permissions", async () => {
    await saveUserAccess(itadmin, norole, { roleIds: [], permissions: ["core.users.manage", "core.users.view"], reason: "รอบสอง" }, known);
    const access = await getUserAccess(norole);
    expect(Object.fromEntries(access.direct.map((d) => [d.permission, d.reason]))).toEqual({
      "core.users.manage": "ทดสอบ",
      "core.users.view": "รอบสอง",
    });
  });

  it("lists every source of a permission given twice", async () => {
    await saveUserAccess(itadmin, norole, { roleIds: [await roleId("it_admin")], permissions: ["core.users.view"], reason: "สองที่มา" }, known);
    const access = await getUserAccess(norole);
    expect(access.effective.find((e) => e.permission === "core.users.view")!.sources.sort()).toEqual(["IT Admin", "direct"]);
  });

  it("refuses to give what the actor does not hold, but allows removing it", async () => {
    await expect(
      saveUserAccess(itadmin, norole, { roleIds: [await roleId("audit")], permissions: [], reason: "x" }, known),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      saveUserAccess(itadmin, norole, { roleIds: [], permissions: ["receipts.manage"], reason: "x" }, known),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await prisma.userPermission.create({ data: { userId: norole, permission: "receipts.manage", reason: "seed" } });
    await saveUserAccess(itadmin, norole, { roleIds: [], permissions: [], reason: "ถอน" }, known);
    expect((await getUserAccess(norole)).direct).toEqual([]);
  });

  it("rejects unknown permissions, the student role and a missing reason", async () => {
    await expect(saveUserAccess(itadmin, norole, { roleIds: [], permissions: ["x.view"], reason: "x" }, known)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(saveUserAccess(itadmin, norole, { roleIds: [await roleId("student")], permissions: [], reason: "x" }, known)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(saveUserAccess(itadmin, norole, { roleIds: [], permissions: ["core.users.view"], reason: " " }, known)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("refuses to remove the last IT Admin", async () => {
    const admins = await prisma.userRoleAssignment.findMany({ where: { role: { key: "it_admin" }, user: { isActive: true } } });
    await prisma.userRoleAssignment.deleteMany({ where: { role: { key: "it_admin" }, userId: { not: itadmin.id } } });
    try {
      await expect(saveUserAccess(itadmin, itadmin.id, { roleIds: [], permissions: [], reason: "ออก" }, known)).rejects.toMatchObject({ code: "CONFLICT" });
    } finally {
      for (const a of admins) {
        await prisma.userRoleAssignment.upsert({ where: { userId_roleId: { userId: a.userId, roleId: a.roleId } }, create: a, update: {} });
      }
    }
  });
  it("writes one audit row per change, with the reason as the note", async () => {
    const before = await prisma.auditLog.count({ where: { subjectId: norole } });
    const { changes } = await saveUserAccess(itadmin, norole, { roleIds: [], permissions: ["core.import.manage"], reason: "ทดสอบ audit" }, known);
    const rows = await prisma.auditLog.findMany({ where: { subjectId: norole }, orderBy: { createdAt: "desc" }, take: changes.length });
    expect(changes.length).toBeGreaterThan(0);
    expect((await prisma.auditLog.count({ where: { subjectId: norole } })) - before).toBe(changes.length);
    expect(rows.every((r) => r.note === "ทดสอบ audit" && r.actorId === itadmin.id)).toBe(true);
  });
});

describe("roles", () => {
  it("creates and updates a role, recording one change each", async () => {
    const created = await createRole(itadmin, { key: "test_helper", name: "ผู้ช่วย", description: null, permissions: ["core.users.view"], reason: "สร้าง" }, known);
    expect(created.changes.map((c) => c.action)).toEqual(["core.role.created"]);
    const updated = await updateRole(itadmin, created.role.id, { name: "ผู้ช่วย 2", description: null, permissions: [], isActive: true, reason: "แก้" }, known);
    expect(updated.role).toMatchObject({ name: "ผู้ช่วย 2", permissions: [] });
    expect(updated.changes.map((c) => c.action)).toEqual(["core.role.updated"]);
    await expect(createRole(itadmin, { key: "test_helper", name: "ซ้ำ", description: null, permissions: [], reason: "x" }, known)).rejects.toMatchObject({ code: "DUPLICATE" });
    await expect(createRole(itadmin, { key: "Bad Key", name: "x", description: null, permissions: [], reason: "x" }, known)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("protects system roles", async () => {
    const id = await roleId("it_admin");
    const perms = (await prisma.rolePermission.findMany({ where: { roleId: id } })).map((p) => p.permission);
    await expect(updateRole(itadmin, id, { name: "IT Admin", description: null, permissions: perms, isActive: false, reason: "x" }, known)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      updateRole(itadmin, id, { name: "IT Admin", description: null, permissions: perms.filter((p) => p !== "core.permissions.manage"), isActive: true, reason: "x" }, known),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
