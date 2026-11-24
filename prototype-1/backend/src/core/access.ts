import { Prisma } from "@prisma/client";
import { prisma, type Tx } from "../db.js";
import { conflict, duplicate, forbidden, notFound, validation } from "../lib/errors.js";
import { audit } from "./audit.js";
import { can, IT_ADMIN_ROLE, STUDENT_ROLE, type SessionUser } from "./permissions.js";

const ROLE_KEY = /^[a-z][a-z0-9_]{1,40}$/;
const MUST_KEEP: Record<string, string[]> = { [IT_ADMIN_ROLE]: ["core.permissions.manage"] };

/** One change made by a save; becomes one audit row (shared plan 2.8). */
export interface AccessChange {
  action: "core.role.assigned" | "core.role.revoked" | "core.permission.granted" | "core.permission.revoked" | "core.role.created" | "core.role.updated";
  subjectType: "user" | "role";
  subjectId: string;
  before?: unknown;
  after?: unknown;
  /** The reason the admin typed for this save. */
  note: string;
}

/** Writes one audit row per change inside the save's transaction (shared plan 2.8). */
async function recordChanges(tx: Tx, actor: SessionUser, changes: AccessChange[]): Promise<void> {
  for (const c of changes) {
    await audit(tx, {
      actorId: actor.id,
      action: c.action,
      subjectType: c.subjectType,
      subjectId: c.subjectId,
      before: c.before,
      after: c.after,
      note: c.note,
    });
  }
}

function requireReason(reason: string | null | undefined): string {
  const r = (reason ?? "").trim();
  if (!r || r.length > 500) throw validation("กรุณาระบุเหตุผล (ไม่เกิน 500 ตัวอักษร)");
  return r;
}

function requireKnown(permissions: string[], known: ReadonlySet<string>): void {
  const unknown = permissions.filter((p) => !known.has(p));
  if (unknown.length) throw validation(`ไม่รู้จักสิทธิ์: ${unknown.join(", ")}`);
}

function requireHeld(actor: SessionUser, permissions: string[]): void {
  const missing = permissions.filter((p) => !can(actor, p));
  if (missing.length) throw forbidden(`ให้ได้เฉพาะสิทธิ์ที่คุณมี: ${missing.join(", ")}`);
}

/**
 * Serialises every change that can shrink the set of active IT Admins (READ COMMITTED would let two
 * transactions each remove a different admin and both see one left). Always take the user/role row lock
 * first, then this one, so lock order is the same everywhere.
 */
async function lockItAdmins(tx: Tx): Promise<void> {
  await tx.$queryRaw`SELECT id FROM roles WHERE key = ${IT_ADMIN_ROLE} FOR UPDATE`;
}

/** Throws when removing it_admin from this user (or deactivating them) would leave no IT Admin. */
export async function assertNotLastItAdmin(tx: Tx, userId: string): Promise<void> {
  const target = await tx.$queryRaw<{ is_active: boolean }[]>`SELECT is_active FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
  // An already-inactive user is not counted as an active admin, so removing them changes nothing.
  if (!target[0] || !target[0].is_active) return;
  await lockItAdmins(tx);
  const holds = await tx.userRoleAssignment.count({ where: { userId, role: { key: IT_ADMIN_ROLE } } });
  if (!holds) return;
  const others = await tx.userRoleAssignment.count({
    where: { role: { key: IT_ADMIN_ROLE }, userId: { not: userId }, user: { isActive: true } },
  });
  if (others === 0) throw conflict("ต้องมี IT Admin ที่ใช้งานอยู่อย่างน้อยหนึ่งคน");
}

export interface UserAccessView {
  user: { id: string; name: string; email: string; studentNo: string | null; isActive: boolean };
  roles: { id: string; key: string; name: string; isActive: boolean }[];
  direct: { permission: string; reason: string; grantedBy: string | null; createdAt: string }[];
  /** sources: role names, "direct", or "student" (the automatic role). */
  effective: { permission: string; sources: string[] }[];
}

export async function getUserAccess(userId: string, db: Tx = prisma): Promise<UserAccessView> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      roles: { include: { role: { include: { permissions: true } } } },
      permissions: { include: { grantedBy: { select: { name: true } } }, orderBy: { permission: "asc" } },
    },
  });
  if (!user) throw notFound("ไม่พบผู้ใช้");
  const student = user.studentNo
    ? await db.role.findFirst({ where: { key: STUDENT_ROLE, isActive: true }, include: { permissions: true } })
    : null;

  const sources = new Map<string, string[]>();
  const add = (p: string, s: string) => sources.set(p, [...(sources.get(p) ?? []), s]);
  for (const a of user.roles) if (a.role.isActive) for (const p of a.role.permissions) add(p.permission, a.role.name);
  for (const p of student?.permissions ?? []) add(p.permission, "student");
  for (const d of user.permissions) add(d.permission, "direct");

  return {
    user: { id: user.id, name: user.name, email: user.email, studentNo: user.studentNo, isActive: user.isActive },
    roles: user.roles
      .map((a) => ({ id: a.role.id, key: a.role.key, name: a.role.name, isActive: a.role.isActive }))
      .sort((x, y) => x.name.localeCompare(y.name)),
    direct: user.permissions.map((d) => ({
      permission: d.permission,
      reason: d.reason,
      grantedBy: d.grantedBy?.name ?? null,
      createdAt: d.createdAt.toISOString(),
    })),
    effective: [...sources.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([permission, s]) => ({ permission, sources: s })),
  };
}

/** Saves the user's complete new state; only the differences are written (and recorded). */
export async function saveUserAccess(
  actor: SessionUser,
  userId: string,
  input: { roleIds: string[]; permissions: string[]; reason: string | null },
  known: ReadonlySet<string>,
): Promise<{ access: UserAccessView; changes: AccessChange[] }> {
  const changes: AccessChange[] = [];
  await prisma.$transaction(async (tx) => {
    // Lock the target first so concurrent saves of the same user run one after the other.
    const target = await tx.$queryRaw<{ is_active: boolean }[]>`SELECT is_active FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    if (!target[0]) throw notFound("ไม่พบผู้ใช้");
    const wantRoles = new Set(input.roleIds);
    const wantPerms = new Set(input.permissions);

    const roles = await tx.role.findMany({ where: { id: { in: [...wantRoles] } }, include: { permissions: true } });
    if (roles.length !== wantRoles.size) throw validation("ไม่พบบทบาทบางรายการ");
    if (roles.some((r) => r.key === STUDENT_ROLE)) throw validation("บทบาทนิสิตได้อัตโนมัติจากรหัสนิสิต ให้หรือถอนไม่ได้");

    const current = await tx.userRoleAssignment.findMany({ where: { userId }, include: { role: true } });
    const currentDirect = await tx.userPermission.findMany({ where: { userId } });
    const haveRoles = new Set(current.map((a) => a.roleId));
    const havePerms = new Set(currentDirect.map((p) => p.permission));

    const addRoles = roles.filter((r) => !haveRoles.has(r.id));
    const removeRoles = current.filter((a) => !wantRoles.has(a.roleId));
    const addPerms = [...wantPerms].filter((p) => !havePerms.has(p)).sort();
    requireKnown(addPerms, known);
    const removePerms = currentDirect.filter((p) => !wantPerms.has(p.permission));
    if (addRoles.length + removeRoles.length + addPerms.length + removePerms.length === 0) return;

    const reason = requireReason(input.reason);
    for (const r of addRoles) {
      if (!r.isActive) throw validation(`บทบาท ${r.name} ปิดใช้งานอยู่`);
      requireHeld(actor, r.permissions.map((p) => p.permission));
    }
    requireHeld(actor, addPerms);
    if (removeRoles.some((a) => a.role.key === IT_ADMIN_ROLE)) {
      // Inactive users are not active admins, so removing theirs cannot empty the set.
      if (target[0].is_active) await lockItAdmins(tx);
      // Remove first, then check: the count below must not include this user any more.
      await tx.userRoleAssignment.deleteMany({ where: { userId, role: { key: IT_ADMIN_ROLE } } });
      if (target[0].is_active) {
        const left = await tx.userRoleAssignment.count({ where: { role: { key: IT_ADMIN_ROLE }, user: { isActive: true } } });
        if (left === 0) throw conflict("ต้องมี IT Admin ที่ใช้งานอยู่อย่างน้อยหนึ่งคน");
      }
    }

    const subject = { subjectType: "user" as const, subjectId: userId, note: reason };
    for (const r of addRoles) {
      await tx.userRoleAssignment.create({ data: { userId, roleId: r.id, grantedById: actor.id } });
      changes.push({ action: "core.role.assigned", ...subject, after: { role: r.key } });
    }
    for (const a of removeRoles) {
      await tx.userRoleAssignment.deleteMany({ where: { userId, roleId: a.roleId } });
      changes.push({ action: "core.role.revoked", ...subject, before: { role: a.role.key } });
    }
    for (const p of addPerms) {
      await tx.userPermission.create({ data: { userId, permission: p, reason, grantedById: actor.id } });
      changes.push({ action: "core.permission.granted", ...subject, after: { permission: p } });
    }
    for (const p of removePerms) {
      await tx.userPermission.delete({ where: { userId_permission: { userId, permission: p.permission } } });
      changes.push({ action: "core.permission.revoked", ...subject, before: { permission: p.permission, reason: p.reason } });
    }
    await recordChanges(tx, actor, changes);
  });
  return { access: await getUserAccess(userId), changes };
}

export interface RoleView {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  permissions: string[];
  userCount: number;
}

const toRoleView = (r: Prisma.RoleGetPayload<{ include: { permissions: true; _count: { select: { users: true } } } }>): RoleView => ({
  id: r.id,
  key: r.key,
  name: r.name,
  description: r.description,
  isSystem: r.isSystem,
  isActive: r.isActive,
  permissions: r.permissions.map((p) => p.permission).sort(),
  userCount: r._count.users,
});

const roleInclude = { permissions: true, _count: { select: { users: true } } } as const;

export async function listRoles(): Promise<RoleView[]> {
  const roles = await prisma.role.findMany({ include: roleInclude, orderBy: [{ isSystem: "desc" }, { name: "asc" }] });
  return roles.map(toRoleView);
}

export async function getRole(id: string): Promise<RoleView & { members: { id: string; name: string; email: string }[] }> {
  const role = await prisma.role.findUnique({
    where: { id },
    include: { ...roleInclude, users: { include: { user: { select: { id: true, name: true, email: true } } } } },
  });
  if (!role) throw notFound("ไม่พบบทบาท");
  return { ...toRoleView(role), members: role.users.map((a) => a.user).sort((a, b) => a.name.localeCompare(b.name)) };
}

export async function createRole(
  actor: SessionUser,
  input: { key: string; name: string; description: string | null; permissions: string[]; reason: string },
  known: ReadonlySet<string>,
): Promise<{ role: RoleView; changes: AccessChange[] }> {
  if (!ROLE_KEY.test(input.key)) throw validation("key ต้องเป็นตัวพิมพ์เล็ก ตัวเลข หรือ _ ขึ้นต้นด้วยตัวอักษร (2–41 ตัว)");
  const name = input.name.trim();
  if (!name) throw validation("กรุณาระบุชื่อบทบาท");
  const reason = requireReason(input.reason);
  const permissions = [...new Set(input.permissions)].sort();
  requireKnown(permissions, known);
  requireHeld(actor, permissions);
  try {
    return await prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: { key: input.key, name, description: input.description?.trim() || null, permissions: { create: permissions.map((permission) => ({ permission })) } },
        include: roleInclude,
      });
      const changes: AccessChange[] = [
        { action: "core.role.created", subjectType: "role", subjectId: role.id, after: { key: role.key, name, description: role.description, isActive: true, permissions }, note: reason },
      ];
      await recordChanges(tx, actor, changes);
      return { role: toRoleView(role), changes };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw duplicate("key นี้มีอยู่แล้ว");
    throw e;
  }
}

export async function updateRole(
  actor: SessionUser,
  id: string,
  input: { name: string; description: string | null; permissions: string[]; isActive: boolean; reason: string | null },
  known: ReadonlySet<string>,
): Promise<{ role: RoleView; changes: AccessChange[] }> {
  return prisma.$transaction(async (tx) => {
    // Lock the role so concurrent identical saves run one after the other instead of failing on P2002/P2025.
    await tx.$queryRaw`SELECT id FROM roles WHERE id = ${id}::uuid FOR UPDATE`;
    const role = await tx.role.findUnique({ where: { id }, include: roleInclude });
    if (!role) throw notFound("ไม่พบบทบาท");
    const before = toRoleView(role);
    const permissions = [...new Set(input.permissions)].sort();
    const name = input.name.trim();
    if (!name) throw validation("กรุณาระบุชื่อบทบาท");
    const description = input.description?.trim() || null;

    if (role.isSystem && !input.isActive) throw conflict("ปิดบทบาทระบบไม่ได้");
    const missing = (MUST_KEEP[role.key] ?? []).filter((p) => !permissions.includes(p));
    if (missing.length) throw conflict(`บทบาท ${role.name} ต้องมีสิทธิ์ ${missing.join(", ")}`);

    const added = permissions.filter((p) => !before.permissions.includes(p));
    const removed = before.permissions.filter((p) => !permissions.includes(p));
    requireKnown(added, known);
    const changed =
      added.length || removed.length || name !== role.name || description !== role.description || input.isActive !== role.isActive;
    if (!changed) return { role: before, changes: [] };
    const reason = requireReason(input.reason);
    // Reactivating hands every permission of the role to its members again, so the actor must hold them all.
    requireHeld(actor, !role.isActive && input.isActive ? permissions : added);

    await tx.rolePermission.deleteMany({ where: { roleId: id, permission: { in: removed } } });
    await tx.rolePermission.createMany({ data: added.map((permission) => ({ roleId: id, permission })) });
    const after = await tx.role.update({ where: { id }, data: { name, description, isActive: input.isActive }, include: roleInclude });
    const pick = (r: RoleView) => ({ name: r.name, description: r.description, isActive: r.isActive, permissions: r.permissions });
    const changes: AccessChange[] = [
      { action: "core.role.updated", subjectType: "role", subjectId: id, before: pick(before), after: pick(toRoleView(after)), note: reason },
    ];
    await recordChanges(tx, actor, changes);
    return { role: toRoleView(after), changes };
  });
}
