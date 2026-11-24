import type { FastifyInstance } from "fastify";
import { prisma, type Tx } from "../db.js";

/** A permission a module declares in its AppModule (shared plan 2.5). */
export interface PermissionDef {
  /** "<row>.use" | "<row>.view" | "<row>.manage[.<part>]" */
  key: string;
  /** Thai label for the role management page. */
  label: string;
}

export const CORE_PERMISSIONS: PermissionDef[] = [
  { key: "core.users.view", label: "ดูรายชื่อผู้ใช้" },
  { key: "core.users.manage", label: "เพิ่มและแก้ไขผู้ใช้" },
  { key: "core.permissions.manage", label: "จัดการบทบาทและสิทธิ์" },
  { key: "core.import.manage", label: "นำเข้าข้อมูลด้วย CSV" },
];

/** Thai names of core's rows in the permission table. */
export const CORE_ROW_LABELS: Record<string, string> = {
  "core.users": "ผู้ใช้",
  "core.permissions": "บทบาทและสิทธิ์",
  "core.import": "นำเข้าข้อมูล",
};

/** Every user with a student number has this role; it is never stored in user_roles. */
export const STUDENT_ROLE = "student";
export const IT_ADMIN_ROLE = "it_admin";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  titlePrefix: string | null;
  studentNo: string | null;
  /** studentNo != null. Use it to find the user's own data, never to switch features on (use can()). */
  isStudent: boolean;
  /** Effective permissions, sorted. */
  permissions: string[];
}

/** Exact match, no hierarchy: "x.manage" does not include "x.view". */
export const can = (user: { permissions: readonly string[] } | null | undefined, permission: string): boolean =>
  !!user && user.permissions.includes(permission);

/** Active roles of the user + the student role when studentNo is set + direct permissions. */
export async function loadPermissions(userId: string, studentNo: string | null, db: Tx = prisma): Promise<string[]> {
  const [fromRoles, direct] = await Promise.all([
    db.rolePermission.findMany({
      where: {
        role: {
          isActive: true,
          OR: [{ users: { some: { userId } } }, ...(studentNo ? [{ key: STUDENT_ROLE }] : [])],
        },
      },
      select: { permission: true },
    }),
    db.userPermission.findMany({ where: { userId }, select: { permission: true } }),
  ]);
  return [...new Set([...fromRoles, ...direct].map((p) => p.permission))].sort();
}

/** The SessionUser for an active account, or null. */
export async function loadSessionUser(userId: string, db: Tx = prisma): Promise<SessionUser | null> {
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u || !u.isActive) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    titlePrefix: u.titlePrefix,
    studentNo: u.studentNo,
    isStudent: u.studentNo !== null,
    permissions: await loadPermissions(u.id, u.studentNo, db),
  };
}

/** Ids of active users who effectively hold this permission (for choosing notification recipients). */
export async function usersWithPermission(permission: string, db: Tx = prisma): Promise<string[]> {
  const studentRoleHasIt =
    (await db.rolePermission.count({ where: { permission, role: { key: STUDENT_ROLE, isActive: true } } })) > 0;
  const users = await db.user.findMany({
    where: {
      isActive: true,
      OR: [
        { roles: { some: { role: { isActive: true, permissions: { some: { permission } } } } } },
        { permissions: { some: { permission } } },
        ...(studentRoleHasIt ? [{ studentNo: { not: null } }] : []),
      ],
    },
    select: { id: true },
    orderBy: { name: "asc" },
  });
  return users.map((u) => u.id);
}

/** Logs (never throws) when the database holds permission names no module declares. */
export async function warnUnknownPermissions(app: FastifyInstance, known: ReadonlySet<string>): Promise<void> {
  const [roleRows, userRows] = await Promise.all([
    prisma.rolePermission.findMany({ distinct: ["permission"], select: { permission: true } }),
    prisma.userPermission.findMany({ distinct: ["permission"], select: { permission: true } }),
  ]);
  const unknown = [...new Set([...roleRows, ...userRows].map((r) => r.permission))].filter((p) => !known.has(p));
  if (unknown.length) app.log.warn({ unknown }, "Database has permissions that no module declares");
}
