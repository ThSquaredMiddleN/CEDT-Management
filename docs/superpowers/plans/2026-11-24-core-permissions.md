# Core Permissions, Permissions UI, Dev Switcher (ขั้นที่ 5a–5c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** แทน `users.role` ด้วยบทบาทและสิทธิ์ในฐานข้อมูล (5a) เพิ่มหน้าจัดการสิทธิ์ `/admin/access` (5b) และแถบสลับบัญชีทดสอบสำหรับ dev/demo (5c) โดยเจ้าหน้าที่เดิมยังทำได้ทุกอย่างเหมือนเดิม

**Architecture:** สิทธิ์ที่ใช้จริงคำนวณทุก request = สิทธิ์ของบทบาทที่เปิดใช้งาน ∪ สิทธิ์รายคน ∪ บทบาท `student` ถ้ามี `student_no` (ไม่มีวันหมดอายุ ไม่มี deny) แล้วใส่ใน `SessionUser.permissions` แต่ละโมดูลประกาศสิทธิ์และชื่อภาษาไทยใน `AppModule` route ประกาศ `config.permission` ซึ่งตรวจตอน start หน้าจัดการแก้เป็นร่างแล้วส่งสถานะใหม่ทั้งหมด backend หาความต่าง ตรวจกติกา และบันทึกใน transaction เดียว (เขียน audit เมื่อขั้นที่ 4 merge แล้ว) แถบสลับผู้ใช้ลงทะเบียน route เฉพาะเมื่อไม่ใช่ production และตั้ง `DEV_LOGIN_AS=true`

**Tech Stack:** Fastify 5, Prisma 6.19.3 (multi-file schema), PostgreSQL 17, zod 4, Vitest 5, React + React Router v7 + TanStack Query, Tailwind

**อ้างอิง:** [แผนของกลาง](2026-11-23-shared-backend-objects.md) หัวข้อ 1.2, 2.5, 2.6, 2.8, 2.11, 3.8, ขั้นที่ 5a–5c และ [spec หน้าจัดการสิทธิ์](../specs/2026-11-24-permissions-ui-design.md)

---

## ก่อนเริ่ม

- **ลำดับและ PR:** สามส่วน สาม branch สาม PR ตามแผนของกลาง
  - ส่วน A `core/permissions` (5a): เริ่มได้เลยจาก `main` ปัจจุบัน
  - ส่วน B `core/permissions-ui` (5b): แตกจาก `core/permissions` (ถ้าส่วน A merge แล้วแตกจาก `main`)
  - ส่วน C `core/dev-switcher` (5c): แตกจาก `core/permissions` เหมือนกัน ทำพร้อมส่วน B ได้ (ไฟล์ไม่ทับกันยกเว้น `src/modules/index.ts` และ `test/modules.test.ts` ซึ่งแก้คนละบรรทัด)
  - push และเปิด PR เฉพาะเมื่อเจ้าของงานอนุญาต
- **ไม่รอขั้นที่ 2–4:** แผนนี้เขียนบน `main` ที่ `c1b04fb` (หลัง PR #11) โดยไม่สนใจ PR ของขั้นที่ 2–4 เมื่อ PR เหล่านั้นเปิดหรือ merge ค่อย rebase แล้วแก้ตามหลักเดียวกับแผนนี้
  - route ใหม่ที่ยังใช้ `auth: "admin"` / `"any"` / `"student"` → ใส่ `permission` ตามตารางใน Task A6 (เช่น `POST /import/groups` → `core.import.manage`)
  - โค้ดใหม่ที่เลือกผู้รับแจ้งเตือนด้วย `role: "staff"` → `usersWithPermission("<module>.manage", tx)` ผู้รับที่เป็นนิสิต → `studentNo: { not: null }`
  - migration: สร้าง migration ใหม่หลัง rebase ให้ timestamp ใหม่กว่าของ PR อื่น (แผนของกลางหัวข้อ 2.1)
  - audit: ส่วน B ยังไม่เขียน audit จนกว่าขั้นที่ 4 merge แล้วค่อยทำ Task B8 ถ้าขั้นที่ 4 ประกาศ `audit.view` ให้เพิ่มใน role `audit` ด้วย migration ใหม่
- **เลขบรรทัด** ในแผนอ้างอิง `main` ที่ `c1b04fb` ทุกจุดมีคำสั่ง `grep` ให้หาตำแหน่งจริงก่อนแก้
- **การรัน test:** `npm run test:fresh` (ไฟล์เดียว: `npm run test:fresh -- test/core/permissions.test.ts`) ห้ามใช้ `npm run db:reset` หรือ `prisma migrate reset` booking-flow BR-14 fail อยู่แล้วเพราะวันที่ใน seed ไม่ต้องแก้
- **ชื่อสิทธิ์** (ทุกชื่อมีระดับ `use`, `view` หรือ `manage` เพื่อจัดเป็นตารางในหน้าจัดการ)

  | โมดูล (`label`) | สิทธิ์ |
  |---|---|
  | core | `core.users.view`, `core.users.manage`, `core.permissions.manage`, `core.import.manage` |
  | announcements (ประกาศ) | `announcements.view`, `announcements.manage` |
  | news (ข่าวประชาสัมพันธ์) | `news.view`, `news.manage` |
  | bookings (จองห้อง) | `bookings.use`, `bookings.view`, `bookings.manage` |
  | masterdata (ข้อมูลหลัก) | `masterdata.manage` |
  | receipts (ใบเสร็จ) | `receipts.view`, `receipts.manage` |
  | line (LINE) | `line.use` |
  | course_change (ลด-ถอนรายวิชา) | `course_change.use`, `course_change.view`, `course_change.manage`, `course_change.manage.advise` |

  แถวของ core ในหน้าจัดการ: `core.users` = ผู้ใช้, `core.permissions` = บทบาทและสิทธิ์, `core.import` = นำเข้าข้อมูล storage ยังไม่มี backend จึงยังไม่ประกาศ `storage.*`
- **บทบาทที่ migration สร้าง**

  | key | ชื่อ | `is_system` | สิทธิ์ |
  |---|---|---|---|
  | `student` | นิสิต | ใช่ | `course_change.use` |
  | `it_admin` | IT Admin | ใช่ | `core.users.view`, `core.users.manage`, `core.permissions.manage`, `core.import.manage` |
  | `audit` | Audit | ใช่ | `core.users.view`, `announcements.view`, `news.view`, `bookings.view`, `receipts.view`, `course_change.view` |
  | `teacher` | อาจารย์ | ไม่ | `bookings.use`, `course_change.view`, `course_change.manage.advise`, `line.use` |
  | `staff` | เจ้าหน้าที่ (สิทธิ์เดิม) | ไม่ | ทุกตัวในตารางชื่อสิทธิ์ ยกเว้น `course_change.use` และ `core.permissions.manage` (เท่ากับที่ role `staff` เดิมทำได้) |

- **ตัดสินในแผนนี้:**
  - ไม่มีวันหมดอายุและไม่มี deny (spec หน้าจัดการสิทธิ์) ตาราง `user_roles` และ `user_permissions` ไม่มี `expires_at`
  - route ที่แก้ข้อมูลของตัวเอง (logout, เปลี่ยนรหัสผ่าน, อ่านแจ้งเตือน, ขั้นตอนคำร้องที่ตรวจสิทธิ์ข้างใน) ประกาศ `permission: null` ชัดๆ
  - ไม่ cache สิทธิ์ โหลดสองคิวรีต่อ request
  - `course_change.manage.advise` ประกาศไว้แต่ยังไม่มี route ใช้ (ทำใน PR ปรับ course change หัวข้อ 4.1) อาจารย์ใน seed ได้ role `staff` จึงทำได้เหมือนเดิม
  - ผู้ใช้ที่สร้างผ่าน `POST /users` ได้ role `staff` อัตโนมัติจนกว่าส่วน B merge (ส่วน B ไม่เปลี่ยนพฤติกรรมนี้ IT Admin ปรับต่อในหน้าจัดการ)
  - ระบบจริงให้ `it_admin` กับคนแรกด้วย `npm run roles:grant` (Task A3)
  - เมนูคลังอุปกรณ์ยังไม่กันด้วยสิทธิ์จนกว่า storage จะประกาศ `storage.view`
  - นิสิตเรียก `GET /courses` ได้ (เดิม 403) เพราะรายชื่อวิชาไม่เป็นความลับ
  - กติกา "ให้ได้เฉพาะสิทธิ์ที่ตัวเองมี" ทำให้คนที่มีแค่ role `it_admin` ให้ได้เฉพาะสิทธิ์ core เท่านั้น ผู้ดูแลที่ต้องให้บทบาทอื่นต้องมีสิทธิ์เหล่านั้นด้วย (ใน seed `admin@cedt.edu` มีทั้ง `staff` และ `it_admin`)
- **ไม่อยู่ในขอบเขต:** หน้าประวัติการให้สิทธิ์ (ใช้หน้า audit ภายหลัง), บัญชีทดสอบ TA และเจ้าหน้าที่คลัง (รอ storage ประกาศสิทธิ์), ลบ `DevStudentSwitcher` ของ storage (เจ้าของ storage ทำหลังส่วน C merge)

## โครงไฟล์

```
prototype-1/backend/
  prisma/schema/core.prisma                       ← A: Role, RolePermission, UserRoleAssignment, UserPermission; ลบ role
  prisma/schema/migrations/<ts>_core_permissions/ ← A: ตาราง + บทบาทเริ่มต้น + staff เดิมได้ role staff
  prisma/schema/migrations/<ts>_drop_user_role/   ← A
  prisma/seed-test-accounts.ts                    ← A: บัญชี @test.local, assignRole()
  prisma/seed.ts, prisma/seed-course-change.ts    ← A
  scripts/grant-role.ts                           ← A: npm run roles:grant
  src/core/permissions.ts                         ← A: SessionUser, PermissionDef, can, loadPermissions, loadSessionUser, usersWithPermission
  src/core/permission-layout.ts                   ← B: parsePermission, buildCatalogRows
  src/core/access.ts                              ← B: getUserAccess, saveUserAccess, listRoles, createRole, updateRole, assertNotLastItAdmin
  src/modules/types.ts                            ← A: AppModule.permissions, label; C: BuildOptions.devLoginAs
  src/modules/index.ts                            ← A: permissionCatalog, permissionRowLabels; B: accessModule; C: devModule
  src/modules/access/{index,routes}.ts            ← B
  src/modules/dev/{index,routes}.ts               ← C
  src/plugins/auth.ts                             ← A: AuthLevel public|user, permission; C: startSession()
  src/config.ts                                   ← C: DEV_LOGIN_AS
  src/app.ts                                      ← A, B
  test/helpers/session.ts                         ← A: loginAs()
  test/core/{permissions,auth-permissions,access,dev-login}.test.ts
prototype-1/frontend/src/
  api/types.ts, api/endpoints.ts                  ← A
  api/access.ts                                   ← B
  app/permissions.ts (+ test)                     ← A: can, isStaff
  app/router.tsx, app/AuthProvider.tsx, app/AppShell.tsx ← A; B: route /admin/access
  app/DevUserSwitcher.tsx, app/devSwitcher.ts (+ test) ← C
  main.tsx                                        ← C
  features/access/{AccessPage,UserAccess,RoleEditor,PermissionMatrix,SaveChangesDialog}.tsx, matrix.ts (+ test) ← B
  features/admin/layout/AdminLayout.tsx           ← A, B
  features/course-change/*, login/*, line-link/*, booking-form/*, calendar/*, master-data/* ← A
```

---

# ส่วน A: Core permissions (5a) — branch `core/permissions`

### Task A1: สร้าง branch และสำรวจจุดที่ใช้ role

**Files:** ไม่มี

- [ ] **Step 1: แตก branch จาก `main` ล่าสุด**

```bash
git fetch origin
git switch -c core/permissions origin/main
```

ถ้าทำใน worktree ใหม่ ให้คัดลอก `prototype-1/backend/.env` มาจากที่เดิม (ห้ามพิมพ์เนื้อหาไฟล์)

- [ ] **Step 2: ติดตั้งและวัด test ตั้งต้น**

```bash
cd prototype-1/backend && npm ci && npx prisma generate && npm run test:fresh && npx tsc --noEmit
cd ../frontend && npm ci && npm run typecheck && npm test
```

Expected: backend ผ่านทั้งหมดยกเว้น BR-14, frontend ผ่านทั้งหมด จดจำนวน test

- [ ] **Step 3: เก็บรายการจุดที่ต้องย้าย ไว้นอก repo**

```bash
cd ../backend
grep -rn 'auth: "\(any\|admin\|student\|user\)"' src > "${TMPDIR:-/tmp}/5a-routes.txt"
grep -rn '\.role\b\|role:\|role ===\|activeAdminIds' src prisma/*.ts scripts test > "${TMPDIR:-/tmp}/5a-role.txt"
cd ../frontend
grep -rn 'role\b\|Role\b\|roleLanding\|RequireAuth' src | grep -v 'role="' > "${TMPDIR:-/tmp}/5a-frontend.txt"
wc -l "${TMPDIR:-/tmp}"/5a-*.txt
```

ใช้เป็นรายการตรวจใน Task A6, A7, A8 ทุกบรรทัดต้องถูกแก้หรือมีเหตุผลว่าไม่ต้องแก้

---

### Task A2: ตารางสิทธิ์และบทบาทเริ่มต้น

**Files:**
- Modify: `prototype-1/backend/prisma/schema/core.prisma`
- Create: `prototype-1/backend/prisma/schema/migrations/<timestamp>_core_permissions/migration.sql`

ยังไม่ลบ `users.role` ใน Task นี้

- [ ] **Step 1: เพิ่ม model ต่อท้าย `core.prisma`**

```prisma
/// A named set of permissions (a preset that stays attached to its users). Never deleted:
/// is_active = false. System roles come from migrations; their key cannot change.
model Role {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  /// e.g. "it_admin", "student", "teacher". ^[a-z][a-z0-9_]{1,40}$
  key         String   @unique
  name        String
  description String?
  isSystem    Boolean  @default(false) @map("is_system")
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  permissions RolePermission[]
  users       UserRoleAssignment[]

  @@map("roles")
}

model RolePermission {
  roleId     String   @map("role_id") @db.Uuid
  /// A name some module declares in code (see permissionCatalog).
  permission String
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  role Role @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@id([roleId, permission])
  @@map("role_permissions")
}

/// user_roles. Named UserRoleAssignment so it does not clash with the old UserRole enum.
/// The "student" role is never stored here: it comes from users.student_no.
model UserRoleAssignment {
  userId      String   @map("user_id") @db.Uuid
  roleId      String   @map("role_id") @db.Uuid
  grantedById String?  @map("granted_by") @db.Uuid
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  user      User  @relation("userRoles", fields: [userId], references: [id], onDelete: Restrict)
  role      Role  @relation(fields: [roleId], references: [id], onDelete: Restrict)
  grantedBy User? @relation("rolesGranted", fields: [grantedById], references: [id], onDelete: Restrict)

  @@id([userId, roleId])
  @@index([roleId])
  @@map("user_roles")
}

/// A permission given to one person directly (add-only, no deny). A reason is required.
model UserPermission {
  userId      String   @map("user_id") @db.Uuid
  permission  String
  reason      String
  grantedById String?  @map("granted_by") @db.Uuid
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  user      User  @relation("userPermissions", fields: [userId], references: [id], onDelete: Restrict)
  grantedBy User? @relation("permissionsGranted", fields: [grantedById], references: [id], onDelete: Restrict)

  @@id([userId, permission])
  @@map("user_permissions")
}
```

ใน `model User` เพิ่ม

```prisma
  roles              UserRoleAssignment[] @relation("userRoles")
  rolesGranted       UserRoleAssignment[] @relation("rolesGranted")
  permissions        UserPermission[]     @relation("userPermissions")
  permissionsGranted UserPermission[]     @relation("permissionsGranted")
```

- [ ] **Step 2: สร้าง SQL ของตาราง**

```bash
cd prototype-1/backend
npx prisma format
TS=$(date -u +%Y%m%d%H%M%S)
mkdir -p "prisma/schema/migrations/${TS}_core_permissions"
npx prisma migrate deploy
npx prisma migrate diff --from-schema-datasource prisma/schema --to-schema-datamodel prisma/schema --script > "prisma/schema/migrations/${TS}_core_permissions/migration.sql"
```

`TS` ต้องใหม่กว่า migration ล่าสุดใน `prisma/schema/migrations` ไฟล์ต้องมีแค่ `CREATE TABLE` ของ `roles`, `role_permissions`, `user_roles`, `user_permissions` กับ index และ FK ของสี่ตารางนี้ ถ้ามีอย่างอื่นให้หยุดและหาสาเหตุ

- [ ] **Step 3: เติมข้อมูลบทบาทท้ายไฟล์ migration**

```sql
-- Hand-written data (shared plan 1.2, step 5a). Default roles and their permissions.
-- "staff" keeps every account that had users.role = 'staff' able to do what it does today.
INSERT INTO "roles" ("key", "name", "description", "is_system", "updated_at") VALUES
  ('student',  'นิสิต',                  'ได้อัตโนมัติเมื่อมีรหัสนิสิต ไม่ต้องให้',          true,  CURRENT_TIMESTAMP),
  ('it_admin', 'IT Admin',              'จัดการผู้ใช้ บทบาท และสิทธิ์',                   true,  CURRENT_TIMESTAMP),
  ('audit',    'Audit',                 'ดูข้อมูลฝั่งเจ้าหน้าที่ได้อย่างเดียว',             true,  CURRENT_TIMESTAMP),
  ('teacher',  'อาจารย์',                'จองห้อง และดูคำร้องลด-ถอนในฐานะที่ปรึกษา',      false, CURRENT_TIMESTAMP),
  ('staff',    'เจ้าหน้าที่ (สิทธิ์เดิม)', 'สิทธิ์เท่ากับ role staff เดิม ก่อนแยกบทบาท',    false, CURRENT_TIMESTAMP);

INSERT INTO "role_permissions" ("role_id", "permission")
SELECT r."id", p.permission
FROM "roles" r
JOIN (VALUES
  ('student',  'course_change.use'),
  ('it_admin', 'core.users.view'), ('it_admin', 'core.users.manage'),
  ('it_admin', 'core.permissions.manage'), ('it_admin', 'core.import.manage'),
  ('audit', 'core.users.view'), ('audit', 'announcements.view'), ('audit', 'news.view'),
  ('audit', 'bookings.view'), ('audit', 'receipts.view'), ('audit', 'course_change.view'),
  ('teacher', 'bookings.use'), ('teacher', 'course_change.view'),
  ('teacher', 'course_change.manage.advise'), ('teacher', 'line.use'),
  ('staff', 'core.users.view'), ('staff', 'core.users.manage'), ('staff', 'core.import.manage'),
  ('staff', 'announcements.view'), ('staff', 'announcements.manage'),
  ('staff', 'news.view'), ('staff', 'news.manage'),
  ('staff', 'bookings.use'), ('staff', 'bookings.view'), ('staff', 'bookings.manage'),
  ('staff', 'masterdata.manage'),
  ('staff', 'receipts.view'), ('staff', 'receipts.manage'),
  ('staff', 'line.use'),
  ('staff', 'course_change.view'), ('staff', 'course_change.manage'), ('staff', 'course_change.manage.advise')
) AS p(role_key, permission) ON p.role_key = r."key";

-- Everyone who is staff today keeps their access after users.role is dropped.
INSERT INTO "user_roles" ("user_id", "role_id")
SELECT u."id", r."id" FROM "users" u CROSS JOIN "roles" r
WHERE u."role" = 'staff' AND r."key" = 'staff';
```

- [ ] **Step 4: ใช้ migration กับฐานข้อมูล dev และตรวจ**

```bash
npx prisma migrate deploy
npx prisma migrate diff --from-schema-datasource prisma/schema --to-schema-datamodel prisma/schema --exit-code
npx prisma generate
npx tsx --env-file=.env -e "import {PrismaClient} from '@prisma/client';const p=new PrismaClient();const [s,a]=await Promise.all([p.user.count({where:{role:'staff'}}),p.userRoleAssignment.count({where:{role:{key:'staff'}}})]);console.log({staffUsers:s,staffAssignments:a});await p.\$disconnect()"
```

Expected: `No difference detected.` และ `staffUsers` เท่ากับ `staffAssignments`

- [ ] **Step 5: รัน test และ commit**

```bash
npm run test:fresh
npx tsc --noEmit
git add prisma/schema
git commit -m "feat(core): add roles and permissions tables with default roles"
```

Expected: ผ่านเท่า Task A1

---

### Task A3: seed บทบาท บัญชีทดสอบ และสคริปต์ให้บทบาท

**Files:**
- Create: `prototype-1/backend/prisma/seed-test-accounts.ts`
- Modify: `prototype-1/backend/prisma/seed.ts`
- Create: `prototype-1/backend/scripts/grant-role.ts`
- Modify: `prototype-1/backend/package.json`
- Create: `prototype-1/backend/test/helpers/session.ts`

- [ ] **Step 1: สร้าง `prisma/seed-test-accounts.ts`**

```ts
import type { PrismaClient } from "@prisma/client";

/** Dev and demo only (shared plan 2.11). Every test account ends with @test.local. */
export const TEST_PASSWORD = "test1234";
export const TEST_EMAIL_DOMAIN = "@test.local";

export const TEST_ACCOUNTS = [
  { email: "student@test.local", name: "นิสิต ทดสอบ", studentNo: "6800000001", roles: [] },
  { email: "teacher@test.local", name: "อาจารย์ ทดสอบ", studentNo: null, roles: ["teacher"] },
  { email: "staff@test.local", name: "เจ้าหน้าที่ ทดสอบ", studentNo: null, roles: ["staff"] },
  { email: "itadmin@test.local", name: "IT Admin ทดสอบ", studentNo: null, roles: ["it_admin"] },
  { email: "audit@test.local", name: "Audit ทดสอบ", studentNo: null, roles: ["audit"] },
  { email: "norole@test.local", name: "ไม่มีบทบาท ทดสอบ", studentNo: null, roles: [] },
] as const;

/** Gives a user a role by key. Idempotent; never stores the automatic "student" role. */
export async function assignRole(prisma: PrismaClient, userId: string, roleKey: string): Promise<void> {
  if (roleKey === "student") throw new Error("The student role is automatic; never assign it");
  const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
  await prisma.userRoleAssignment.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    create: { userId, roleId: role.id },
    update: {},
  });
}

export async function seedTestAccounts(prisma: PrismaClient, hash: (pw: string) => Promise<string>): Promise<void> {
  const passwordHash = await hash(TEST_PASSWORD);
  for (const a of TEST_ACCOUNTS) {
    const user = await prisma.user.upsert({
      where: { email: a.email },
      update: { name: a.name, studentNo: a.studentNo, isActive: true },
      // `role` is still required until Task A7 drops the column.
      create: { email: a.email, name: a.name, studentNo: a.studentNo, passwordHash, role: a.studentNo ? "student" : "staff" },
    });
    for (const key of a.roles) await assignRole(prisma, user.id, key);
  }
  console.log(`Seed: ${TEST_ACCOUNTS.length} test accounts (${TEST_EMAIL_DOMAIN}).`);
}
```

- [ ] **Step 2: เรียกจาก `prisma/seed.ts`**

```ts
import { assignRole, seedTestAccounts } from "./seed-test-accounts.js";
```

หลังลูปที่สร้าง `users` และ `userByEmail`

```ts
  // Roles (step 5a): the demo admin is staff + IT admin; instructors keep the legacy staff role.
  for (const u of users) await assignRole(prisma, userByEmail[u.email]!.id, "staff");
  await assignRole(prisma, userByEmail["admin@cedt.edu"]!.id, "it_admin");
  await seedTestAccounts(prisma, hash);
```

(ส่งฟังก์ชัน hash ตัวที่ใช้สร้าง `passwordHash` ใน `seed.ts`)

- [ ] **Step 3: สร้าง `scripts/grant-role.ts`**

```ts
// Gives a role to an existing account: npm run roles:grant -- <email> <roleKey>
// Used once after deploying step 5a to give it_admin to the first administrator.
import { PrismaClient } from "@prisma/client";
import { assignRole } from "../prisma/seed-test-accounts.js";

const [email, roleKey] = process.argv.slice(2);
if (!email || !roleKey) {
  console.error("Usage: npm run roles:grant -- <email> <roleKey>");
  process.exit(1);
}
const prisma = new PrismaClient();
try {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("No account with that email");
  await assignRole(prisma, user.id, roleKey);
  console.log(`Gave role ${roleKey}.`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
```

ใน `package.json` ส่วน `scripts` เพิ่ม `"roles:grant": "tsx --env-file=.env scripts/grant-role.ts",`

- [ ] **Step 4: สร้าง `test/helpers/session.ts`**

```ts
import type { FastifyInstance } from "fastify";
import { expect } from "vitest";
import { TEST_PASSWORD } from "../../prisma/seed-test-accounts.js";

/** Logs in and returns the Cookie header value. Test accounts use TEST_PASSWORD by default. */
export async function loginAs(app: FastifyInstance, email: string, password = TEST_PASSWORD): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: { "x-requested-with": "XMLHttpRequest" },
    payload: { email, password },
  });
  expect(res.statusCode, `login ${email}`).toBe(200);
  const cookie = res.cookies.find((c) => c.name === "labsync_session");
  return `labsync_session=${cookie!.value}`;
}

export const idOf = async (
  prisma: { user: { findUniqueOrThrow(a: { where: { email: string } }): Promise<{ id: string }> } },
  email: string,
): Promise<string> => (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
```

- [ ] **Step 5: รันและ commit**

```bash
npm run test:fresh
npx tsc --noEmit
git add prisma/seed.ts prisma/seed-test-accounts.ts scripts/grant-role.ts package.json test/helpers/session.ts
git commit -m "feat(core): seed default role assignments and @test.local accounts"
```

Expected: seed พิมพ์ `Seed: 6 test accounts (@test.local).` test ผ่านเท่าเดิม

---

### Task A4: บริการสิทธิ์ `src/core/permissions.ts`

**Files:**
- Create: `prototype-1/backend/src/core/permissions.ts`
- Test: `prototype-1/backend/test/core/permissions.test.ts`

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

`test/core/permissions.test.ts`:

```ts
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
```

- [ ] **Step 2: รัน test ให้เห็นว่าไม่ผ่าน**

```bash
npm run test:fresh -- test/core/permissions.test.ts
```

Expected: FAIL เพราะ import `../../src/core/permissions.js` ไม่เจอ

- [ ] **Step 3: สร้าง `src/core/permissions.ts`**

```ts
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
```

- [ ] **Step 4: รัน test และ commit**

```bash
npm run test:fresh -- test/core/permissions.test.ts
npx tsc --noEmit
git add src/core/permissions.ts test/core/permissions.test.ts
git commit -m "feat(core): add can(), loadPermissions and usersWithPermission"
```

Expected: 8 test ผ่าน

---

### Task A5: ประกาศสิทธิ์ในโมดูล และใส่ `permissions` ใน session

**Files:**
- Modify: `prototype-1/backend/src/modules/types.ts`, `src/modules/index.ts`
- Modify: `prototype-1/backend/src/modules/*/index.ts`
- Modify: `prototype-1/backend/src/plugins/auth.ts`, `src/modules/auth/routes.ts`, `src/app.ts`
- Test: `prototype-1/backend/test/core/permissions.test.ts`, `test/core/auth-permissions.test.ts`

ใน Task นี้ระดับ auth เดิม (`any`, `admin`, `student`) ยังใช้ได้ และ `SessionUser` ยังมี `role` ชั่วคราว

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

ต่อท้าย `test/core/permissions.test.ts` (เพิ่ม import ด้านบน)

```ts
import { permissionCatalog } from "../../src/modules/index.js";

describe("permission catalog", () => {
  it("has unique names", () => {
    const keys = permissionCatalog.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("covers every permission the default roles use", async () => {
    const known = new Set(permissionCatalog.map((p) => p.key));
    const rows = await prisma.rolePermission.findMany({ select: { permission: true } });
    expect(rows.map((r) => r.permission).filter((p) => !known.has(p))).toEqual([]);
  });
});
```

`test/core/auth-permissions.test.ts`:

```ts
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
```

```bash
npm run test:fresh -- test/core/permissions.test.ts test/core/auth-permissions.test.ts
```

Expected: FAIL (`permissionCatalog` ไม่มี, `/auth/me` ไม่มี `permissions`)

- [ ] **Step 2: เพิ่ม `label` และ `permissions` ใน `AppModule`**

`src/modules/types.ts`:

```ts
import type { PermissionDef } from "../core/permissions.js";
```

```ts
export interface AppModule {
  /** Module name: the prefix of its permissions, notification types, audit actions and env vars. */
  name: string;
  /** Thai name: the row label in the permission table. */
  label?: string;
  /** Permissions this module checks. Roles may only use names declared here (shared plan 2.5). */
  permissions?: PermissionDef[];
  /** Registers the module's routes (under API_PREFIX) and starts any background work. */
  setup(app: FastifyInstance, opts: BuildOptions): Promise<void>;
}
```

- [ ] **Step 3: ประกาศในแต่ละโมดูล**

ตัวอย่าง `src/modules/announcements/index.ts`:

```ts
import { API_PREFIX, type AppModule } from "../types.js";
import { announcementRoutes } from "./routes.js";

export const announcementsModule: AppModule = {
  name: "announcements",
  label: "ประกาศ",
  permissions: [
    { key: "announcements.view", label: "ดูประกาศฝั่งเจ้าหน้าที่" },
    { key: "announcements.manage", label: "สร้าง แก้ไข และเผยแพร่ประกาศ" },
  ],
  async setup(app) {
    await app.register(announcementRoutes, { prefix: API_PREFIX });
  },
};
```

| ไฟล์ | `label` | `permissions` |
|---|---|---|
| `news/index.ts` | ข่าวประชาสัมพันธ์ | `news.view` "ดูข่าวฝั่งเจ้าหน้าที่", `news.manage` "สร้าง แก้ไข และเผยแพร่ข่าว" |
| `bookings/index.ts` | จองห้อง | `bookings.use` "ขอจองห้อง", `bookings.view` "ดูคำขอจองทั้งหมด", `bookings.manage` "อนุมัติ ปฏิเสธ และย้ายการจอง" |
| `masterdata/index.ts` | ข้อมูลหลัก | `masterdata.manage` "จัดการอาคาร ห้อง เทอม และวิชา" |
| `receipts/index.ts` | ใบเสร็จ | `receipts.view` "ดูผลตรวจใบเสร็จ", `receipts.manage` "ตรวจและลบใบเสร็จ" |
| `line/index.ts` | LINE | `line.use` "เชื่อมบัญชี LINE" |
| `course-change/index.ts` | ลด-ถอนรายวิชา | `course_change.use` "ยื่นคำร้อง", `course_change.view` "ดูคำร้องทั้งหมด", `course_change.manage` "ดำเนินการคำร้อง", `course_change.manage.advise` "พิจารณาในฐานะอาจารย์ที่ปรึกษา" |

(ทุกช่องเขียนเป็น `{ key: "...", label: "..." }`)

- [ ] **Step 4: รวมรายชื่อใน `src/modules/index.ts`**

เพิ่ม import ด้านบนและ export ท้ายไฟล์

```ts
import { CORE_PERMISSIONS, CORE_ROW_LABELS, type PermissionDef } from "../core/permissions.js";
```

```ts
/** Every permission the code knows: core's plus each module's. */
export const permissionCatalog: PermissionDef[] = [...CORE_PERMISSIONS, ...modules.flatMap((m) => m.permissions ?? [])];

/** Thai row labels for the permission table, by row (module name or core row). */
export const permissionRowLabels: Record<string, string> = {
  ...CORE_ROW_LABELS,
  ...Object.fromEntries(modules.filter((m) => m.label).map((m) => [m.name, m.label!])),
};
```

- [ ] **Step 5: `src/plugins/auth.ts` รู้จักสิทธิ์ (ยังรองรับระดับเดิม)**

```ts
import { can, loadSessionUser, type SessionUser as CoreSessionUser } from "../core/permissions.js";

export type AuthLevel = "public" | "user" | "student" | "any" | "admin"; // legacy levels go in Task A6

export type Role = "staff" | "student"; // removed in Task A7

/** Until Task A7 the old role rides along; new code must use permissions. */
export type SessionUser = CoreSessionUser & { role: Role };
```

ใน `declare module "fastify"`:

```ts
  interface FastifyContextConfig {
    auth?: AuthLevel;
    /**
     * Permission the caller must hold. `null` = any signed-in user; the handler checks ownership
     * itself. Required (string or null) on every non-public route that changes data.
     */
    permission?: string | null;
    /** Set `csrf: false` only on routes with their own request authentication (the LINE webhook). */
    csrf?: boolean;
  }
```

`resolveUser`:

```ts
async function resolveUser(req: FastifyRequest): Promise<SessionUser | undefined> {
  const raw = req.cookies[config.SESSION_COOKIE_NAME];
  if (!raw) return undefined;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(raw) },
    select: { expiresAt: true, userId: true, user: { select: { role: true } } },
  });
  if (!session || session.expiresAt <= new Date()) return undefined;
  const user = await loadSessionUser(session.userId);
  return user ? { ...user, role: session.user.role } : undefined;
}
```

`registerAuth` รับรายชื่อสิทธิ์:

```ts
export function registerAuth(app: FastifyInstance, knownPermissions: ReadonlySet<string>): void {
  // Every route must declare its auth level; an undeclared route is a startup error (§6.2).
  app.addHook("onRoute", (route) => {
    if (route.method === "HEAD" || route.method === "OPTIONS") return;
    if (!route.url.startsWith("/api/v1")) return;
    if (!route.config?.auth) {
      throw new Error(`Route ${route.method} ${route.url} does not declare config.auth`);
    }
    const p = route.config.permission;
    if (typeof p === "string" && !knownPermissions.has(p)) {
      throw new Error(`Route ${route.method} ${route.url} uses unknown permission "${p}"`);
    }
  });
```

ใน `preHandler` หลัง `if (!req.user) throw unauthenticated();` เพิ่ม

```ts
    const permission = req.routeOptions.config?.permission;
    if (permission && !can(req.user, permission)) throw forbidden();
```

(บล็อก `student` / `any` / `admin` เดิมคงไว้จนถึง Task A6)

- [ ] **Step 6: `src/app.ts`**

```ts
import { warnUnknownPermissions } from "./core/permissions.js";
import { modules, permissionCatalog } from "./modules/index.js";
```

แทน `registerAuth(app);` ด้วย

```ts
  const knownPermissions = new Set(permissionCatalog.map((p) => p.key));
  registerAuth(app, knownPermissions);
  app.addHook("onReady", async () => {
    if (config.NODE_ENV !== "test") await warnUnknownPermissions(app, knownPermissions);
  });
```

- [ ] **Step 7: `/auth/login` คืน user แบบเดียวกับ `/auth/me`**

ใน `src/modules/auth/routes.ts` import `loadSessionUser` จาก `../../core/permissions.js` แทน `return { user: { ... } }` ท้าย `/auth/login` ด้วย

```ts
    const sessionUser = await loadSessionUser(user.id);
    return { user: { ...sessionUser!, role: user.role } };
```

- [ ] **Step 8: แก้จุดที่ประกอบ `SessionUser` เอง**

```bash
grep -rn "studentNo: row.studentNo\|studentNo: u.studentNo\|as SessionUser" src prisma scripts test
```

ทุกที่ (เช่น `prisma/seed.ts`, `prisma/seed-course-change.ts`, `scripts/line-pending.ts`, `test/course-catalog.test.ts`) เปลี่ยนเป็น `{ ...(await loadSessionUser(row.id))!, role: row.role }` ใน seed ให้เรียกหลังให้บทบาทแล้ว

- [ ] **Step 9: รัน test และ commit**

```bash
npx tsc --noEmit
npm run test:fresh
git add src test prisma scripts
git commit -m "feat(core): declare module permissions and load them into the session"
```

Expected: ผ่านทั้งหมดยกเว้น BR-14 รวม test ใหม่ 4 ตัว

---

### Task A6: ย้ายทุก route และทุกจุดที่ตรวจ role เป็นสิทธิ์

**Files:**
- Modify: `prototype-1/backend/src/plugins/auth.ts`
- Modify: `prototype-1/backend/src/modules/*/routes.ts`
- Modify: `prototype-1/backend/src/modules/{bookings,course-change,notifications,calendar}/*.ts`
- Test: `prototype-1/backend/test/core/auth-permissions.test.ts`

- [ ] **Step 1: เพิ่ม test ที่ยังไม่ผ่าน**

ต่อท้าย `test/core/auth-permissions.test.ts`

```ts
import Fastify from "fastify";
import { registerAuth } from "../../src/plugins/auth.js";

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
```

ตรวจ path ของ receipts และ course change ใน `routes.ts` ก่อน ถ้าต่างให้แก้ test ตาม ถ้า seed ไม่มีคำร้องของนิสิตคนอื่น ให้สร้างหนึ่งรายการใน test โดยใช้ helper เดียวกับ `test/course-change-flow.test.ts`

```bash
npm run test:fresh -- test/core/auth-permissions.test.ts
```

Expected: FAIL

- [ ] **Step 2: บังคับ `permission` และเลิกใช้ระดับเดิมใน `src/plugins/auth.ts`**

```ts
export type AuthLevel = "public" | "user";
```

ใน `onRoute` ต่อจากการตรวจ unknown permission:

```ts
    const methods = [route.method].flat();
    const changesData = methods.some((m) => !["GET", "HEAD", "OPTIONS"].includes(m));
    const declared = Object.prototype.hasOwnProperty.call(route.config, "permission");
    if (route.config.auth !== "public" && changesData && !declared) {
      throw new Error(
        `Route ${methods.join(",")} ${route.url} changes data but does not declare config.permission (use null for own-data routes)`,
      );
    }
    if (route.config.auth === "public" && p) {
      throw new Error(`Route ${methods.join(",")} ${route.url} is public but declares a permission`);
    }
```

ใน `preHandler` ค่าเริ่มต้น `level` เป็น `"user"` และลบบล็อก `student` / `any` / `admin` ให้ท้ายเป็น

```ts
    if (level === "public") return;
    if (!req.user) throw unauthenticated();
    const permission = req.routeOptions.config?.permission;
    if (permission && !can(req.user, permission)) throw forbidden();
```

- [ ] **Step 3: ย้าย config ของทุก route**

ใช้ `${TMPDIR:-/tmp}/5a-routes.txt` เป็นรายการตรวจ

| โมดูล | route เดิม | config ใหม่ |
|---|---|---|
| auth | `POST /auth/logout`, `PATCH /users/me/password` | `{ auth: "user", permission: null }` |
| announcements | GET ที่เป็น `admin` | `{ auth: "user", permission: "announcements.view" }` |
| announcements | POST, PATCH, DELETE ที่เป็น `admin` | `{ auth: "user", permission: "announcements.manage" }` |
| news | GET ที่เป็น `admin` | `{ auth: "user", permission: "news.view" }` |
| news | POST, PATCH, DELETE ที่เป็น `admin` | `{ auth: "user", permission: "news.manage" }` |
| bookings | `GET /bookings`, `GET /bookings/:id` | `{ auth: "user" }` + กรองใน service (Step 5) |
| bookings | `POST /bookings`, `POST /bookings/check-conflicts` | `{ auth: "user", permission: "bookings.use" }` |
| bookings | approve, reject, move และ PATCH | `{ auth: "user", permission: "bookings.manage" }` |
| bookings | ถอนหรือยกเลิกคำขอของตัวเอง (ถ้ามี) | `{ auth: "user", permission: "bookings.use" }` + ตรวจว่าเป็นของตัวเองหรือมี `bookings.manage` |
| masterdata | `GET /courses` | `{ auth: "user" }` |
| masterdata | `GET /users` | `{ auth: "user", permission: "core.users.view" }` |
| masterdata | POST, PATCH ของ buildings, rooms, terms, courses | `{ auth: "user", permission: "masterdata.manage" }` |
| masterdata | `POST /users`, `PATCH /users/:id` | `{ auth: "user", permission: "core.users.manage" }` |
| import | `/import/courses`, `/import/rooms` | `{ auth: "user", permission: "core.import.manage" }` |
| line | `GET /line/status`, `POST /line/link`, `POST /line/unlink` | `{ auth: "user", permission: "line.use" }` |
| receipts | `GET /receipts` | `{ auth: "user", permission: "receipts.view" }` |
| receipts | `POST /receipts/check`, `DELETE /receipts/:id` | `{ auth: "user", permission: "receipts.manage" }` |
| course-change | ทุก route ที่เป็น `student` | `{ auth: "user", permission: "course_change.use" }` |
| course-change | GET ที่เป็น `admin` | `{ auth: "user", permission: "course_change.view" }` |
| course-change | POST ที่เป็น `admin` | `{ auth: "user", permission: "course_change.manage" }` |
| course-change | GET ที่เป็น `user` | `{ auth: "user" }` (กรองด้วย `isCcStaff`) |
| course-change | POST ที่เป็น `user` | `{ auth: "user", permission: null }` (ตรวจข้างในตาม Step 4) |
| notifications | `POST /notifications/read` | `{ auth: "user", permission: null }` |
| route อื่นที่ไม่อยู่ในตาราง (รวม route จาก PR อื่นตอน rebase) | `admin` / `any` | สิทธิ์ของโมดูลนั้น: GET → `.view`, แก้ข้อมูล → `.manage` |

```bash
grep -rn 'auth: "\(any\|admin\|student\)"' src
```

Expected: ไม่มีผลลัพธ์

- [ ] **Step 4: course change**

ใน `src/modules/course-change/service.ts` เพิ่ม

```ts
import { can, usersWithPermission } from "../../core/permissions.js";

/** Course Change staff view: sees every request instead of only their own. */
export const isCcStaff = (me: { permissions: readonly string[] }): boolean => can(me, "course_change.view");
```

หาตำแหน่งด้วย `grep -n "role\|activeAdminIds" src/modules/course-change/*.ts` แล้วแทนตามตาราง (บรรทัดของ `c1b04fb`)

| ไฟล์:บรรทัด | เดิม | ใหม่ |
|---|---|---|
| `service.ts:216` | `where: { id: { in: recipients }, role: "student" }` | `where: { id: { in: recipients }, studentNo: { not: null } }` |
| `service.ts:239` | `return activeAdminIds(tx);` | `return usersWithPermission("course_change.manage", tx);` |
| `service.ts:480` | `me.role === "student" ? { studentId: me.id } : {}` | `isCcStaff(me) ? {} : { studentId: me.id }` |
| `service.ts:566` | `me.role === "student" && r.studentId !== me.id` | `!isCcStaff(me) && r.studentId !== me.id` |
| `service.ts:574` | `me.role === "student" ? { OR: [...] } : {}` | `!isCcStaff(me) ? { OR: [...] } : {}` |
| `workflow.ts:415` | `await activeAdminIds(tx)` | `await usersWithPermission("course_change.manage", tx)` |
| `workflow.ts:472-473` | `studentAction ? me.role !== "student" \|\| r.studentId !== me.id : me.role !== "staff"` | `studentAction ? r.studentId !== me.id : !can(me, "course_change.manage")` |
| `workflow.ts:613` | `me.role === "student" ? await activeAdminIds(tx) : [r.studentId]` | `me.id === r.studentId ? await usersWithPermission("course_change.manage", tx) : [r.studentId]` |
| `workflow.ts:664` | `me.role === "student" &&` | `!can(me, "course_change.manage") &&` |
| `workflow.ts:672` | `me.role === "staff" &&` | `can(me, "course_change.manage") &&` |
| `workflow.ts:723` | `if (me.role !== "student")` | `if (r.studentId !== me.id)` |
| `workflow.ts:804` | `if (me.role === "student" && file.kind === "signed_petition")` | `if (!isCcStaff(me) && file.kind === "signed_petition")` |

ใน `workflow.ts` import `can`, `usersWithPermission` จาก `../../core/permissions.js` และ `isCcStaff` จาก `./service.js` ลบ import `activeAdminIds` คำว่า `"staff"`/`"student"` ใน `queue.ts` เป็นชื่อฝั่งของขั้นตอน ไม่ต้องแก้

- [ ] **Step 5: bookings, calendar, notifications**

`src/modules/bookings/service.ts`: `activeAdminIds(tx)` ทุกจุด (221, 466, 475) → `usersWithPermission("bookings.manage", tx)` และเพิ่ม

```ts
import { can, usersWithPermission } from "../../core/permissions.js";
import { forbidden } from "../../lib/errors.js";

/** bookings.view sees every booking; bookings.use sees the ones they requested or teach. */
export function bookingVisibility(me: { id: string; permissions: readonly string[] }): Prisma.BookingWhereInput {
  if (can(me, "bookings.view")) return {};
  if (can(me, "bookings.use")) return { OR: [{ requestedById: me.id }, { instructorId: me.id }] };
  throw forbidden();
}
```

ตรวจชื่อคอลัมน์ใน `prisma/schema/bookings.prisma` (relation `requestedBy`, `instructor`) แล้วรวม `bookingVisibility(me)` ในฟังก์ชันอ่านรายการและรายละเอียด (ที่มี comment `Single \`staff\` role` บรรทัด 700, 740) ด้วย `where: { AND: [existingWhere, bookingVisibility(me)] }` รายละเอียดที่ไม่เห็นตอบ 404 แบบเดิม แก้ comment ให้ตรงกฎใหม่

`src/modules/calendar/routes.ts` บรรทัด 45:

```ts
      me && can(me, "bookings.view") ? requested : (["approved"] as ("approved" | "pending")[]);
```

`src/modules/notifications/service.ts`: ลบ `activeAdminIds`

```bash
grep -rn "activeAdminIds\|\.role\b\|role ===" src
```

Expected: เหลือเฉพาะ `masterdata/routes.ts`, `auth/routes.ts`, `plugins/auth.ts` (Task A7)

- [ ] **Step 6: รัน test และ commit**

```bash
npx tsc --noEmit
npm run test:fresh
git add src test
git commit -m "feat(core): check permissions on every route instead of users.role"
```

Expected: ผ่านทั้งหมดยกเว้น BR-14 ถ้า test เดิมยืนยันว่านิสิตได้ 403 จาก `GET /courses` ให้แก้เป็น 200 (ตั้งใจเปลี่ยน) และเขียนเหตุผลใน commit

---

### Task A7: ลบ `users.role`

**Files:**
- Modify: `prototype-1/backend/prisma/schema/core.prisma`
- Create: `prototype-1/backend/prisma/schema/migrations/<timestamp>_drop_user_role/migration.sql`
- Modify: `src/plugins/auth.ts`, `src/modules/auth/routes.ts`, `src/modules/masterdata/routes.ts`, `prisma/seed*.ts`, `scripts/*.ts`, `test/**/*.ts`

- [ ] **Step 1: แก้ schema และสร้าง migration**

ใน `core.prisma` ลบ `enum UserRole`, บรรทัด `role UserRole` ใน `User` และเปลี่ยน `@@index([role, isActive])` เป็น `@@index([isActive])`

```bash
npx prisma format
TS=$(date -u +%Y%m%d%H%M%S)
mkdir -p "prisma/schema/migrations/${TS}_drop_user_role"
npx prisma migrate diff --from-schema-datasource prisma/schema --to-schema-datamodel prisma/schema --script > "prisma/schema/migrations/${TS}_drop_user_role/migration.sql"
cat "prisma/schema/migrations/${TS}_drop_user_role/migration.sql"
```

Expected: มีแค่ `DROP INDEX "users_role_is_active_idx"`, `ALTER TABLE "users" DROP COLUMN "role"`, `DROP TYPE "user_role"`, `CREATE INDEX "users_is_active_idx"` เติมบรรทัดแรก

```sql
-- Step 5a: users.role is replaced by roles/user_roles. Every former staff account was given
-- the "staff" role by the core_permissions migration before this column goes.
```

- [ ] **Step 2: ลบ `role` ออกจากโค้ด**

```bash
npx prisma generate
npx tsc --noEmit
```

แก้ทุก error:
- `src/plugins/auth.ts`: ลบ `Role`; `export type { SessionUser } from "../core/permissions.js";`; `resolveUser` เลือก `{ expiresAt: true, userId: true }` และคืน `(await loadSessionUser(session.userId)) ?? undefined`
- `src/modules/auth/routes.ts`: `return { user: sessionUser };`
- `src/modules/masterdata/routes.ts`:
  - `userCreate`, `userPatch`: ลบ `role`
  - `GET /users`: query `role` → `permission: z.string().optional()` แล้ว

    ```ts
    if (q.permission) where.id = { in: await usersWithPermission(q.permission) };
    const users = await prisma.user.findMany({
      where,
      orderBy: { name: "asc" },
      include: { roles: { include: { role: { select: { name: true } } } } },
    });
    ```

    response แทน `role: u.role` ด้วย `roles: u.roles.map((a) => a.role.name)` ลบ comment `Single \`staff\` role ...`
  - `POST /users`:

    ```ts
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: body.name,
          email: body.email,
          titlePrefix: body.titlePrefix ?? null,
          passwordHash: await argon2.hash(body.password, { type: argon2.argon2id }),
        },
      });
      // New accounts get the legacy staff role; IT Admin adjusts it on /admin/access (step 5b).
      const staff = await tx.role.findUniqueOrThrow({ where: { key: "staff" } });
      await tx.userRoleAssignment.create({ data: { userId: created.id, roleId: staff.id, grantedById: requireUser(req).id } });
      return created;
    });
    ```

    ลบ `role` จาก response ของ POST และ PATCH
- `prisma/seed.ts`, `prisma/seed-course-change.ts`, `prisma/seed-test-accounts.ts`: ลบ `role: ...` ทุกที่; `{ ...loadSessionUser, role }` → `(await loadSessionUser(id))!`
- สคริปต์และ test ที่สร้างผู้ใช้หรือ `SessionUser` เอง (`test/line/dispatcher.test.ts`, `test/booking-flow.test.ts`, `test/course-catalog.test.ts`, `test/course-change-retry.test.ts`, `test/cross-module-integration.test.ts`, `scripts/line-pending.ts`): ลบ `role` ใช้ `loadSessionUser(id)`

```bash
grep -rn "\brole\b" src prisma/*.ts scripts test | grep -v "roles\|Role\b\|role_\|roleId\|roleKey"
```

Expected: ไม่เหลือที่หมายถึง `users.role`

- [ ] **Step 3: ใช้ migration รัน test และ commit**

```bash
npx prisma migrate deploy
npx prisma migrate diff --from-schema-datasource prisma/schema --to-schema-datamodel prisma/schema --exit-code
npx tsc --noEmit
npm run test:fresh
git add prisma src scripts test
git commit -m "feat(core): drop users.role"
```

Expected: `No difference detected.` test ผ่านทั้งหมดยกเว้น BR-14

---

### Task A8: frontend ใช้สิทธิ์แทน role

**Files:**
- Create: `prototype-1/frontend/src/app/permissions.ts`, `src/app/permissions.test.ts`
- Modify: `src/api/types.ts`, `src/api/endpoints.ts`, `src/app/router.tsx`, `src/app/AuthProvider.tsx`, `src/app/AppShell.tsx`, `src/features/admin/layout/AdminLayout.tsx`, `src/features/course-change/{CourseChangePage,WorkflowPanel}.tsx`, `src/features/login/LoginPage.tsx`, `src/features/line-link/LineLinkPage.tsx`, `src/features/booking-form/BookingForm.tsx`, `src/features/calendar/CalendarPage.tsx`, `src/features/master-data/MasterDataPage.tsx`

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

`src/app/permissions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { can, isStaff } from "./permissions";

describe("can", () => {
  it("matches exactly and handles a signed-out user", () => {
    expect(can({ permissions: ["news.manage"] }, "news.manage")).toBe(true);
    expect(can({ permissions: ["news.manage"] }, "news.view")).toBe(false);
    expect(can(null, "news.view")).toBe(false);
  });
});

describe("isStaff", () => {
  it("is true with any .view permission (opens /admin)", () => {
    expect(isStaff({ permissions: ["course_change.use", "receipts.view"] })).toBe(true);
    expect(isStaff({ permissions: ["course_change.use", "bookings.use"] })).toBe(false);
    expect(isStaff(null)).toBe(false);
  });
});
```

```bash
cd prototype-1/frontend
npx vitest run src/app/permissions.test.ts
```

Expected: FAIL

- [ ] **Step 2: สร้าง `src/app/permissions.ts`**

```ts
type WithPermissions = { permissions: readonly string[] } | null | undefined;

/** Same rule as the backend's can(): exact name, no hierarchy. Hides pages only; the API enforces. */
export const can = (user: WithPermissions, permission: string): boolean =>
  !!user && user.permissions.includes(permission);

/** /admin opens for anyone who can view at least one module's staff pages (shared plan 2.5). */
export const isStaff = (user: WithPermissions): boolean =>
  !!user && user.permissions.some((p) => p.endsWith(".view"));
```

- [ ] **Step 3: type ผู้ใช้ใน `src/api/types.ts`**

ลบ `export type Role` และ

```ts
export interface User {
  id: string;
  name: string;
  email: string;
  titlePrefix: string | null;
  studentNo: string | null;
  /** studentNo != null. For finding the user's own data only; use can() for features. */
  isStudent: boolean;
  /** Effective permissions from /auth/me. */
  permissions: string[];
}
```

ใน `DirectoryUser` แทน `role?: Role` ด้วย `roles: string[];`

- [ ] **Step 4: `useUsers` กรองด้วยสิทธิ์ (`src/api/endpoints.ts`)**

```ts
export function useUsers(
  params: { permission?: string; active?: string } = {},
  options: { enabled?: boolean } = {},
) {
  const s = new URLSearchParams();
  if (params.permission) s.set("permission", params.permission);
  if (params.active) s.set("active", params.active);
```

แทน `useUsers({ role: "staff", active: "true" }...)` ใน BookingForm, CalendarPage, MasterDataPage ด้วย `useUsers({ permission: "bookings.use", active: "true" }...)`

- [ ] **Step 5: `AuthProvider`, `AppShell`, login, LINE**

`src/app/AuthProvider.tsx`: ลบ `Role` และ

```ts
// Everyone lands on the portal home (news and announcements).
export const roleLanding = (): string => "/";
```

`roleLanding(...)` ทุกที่ใน `LoginPage.tsx`, `LineLinkPage.tsx` → `roleLanding()`

`src/app/AppShell.tsx`: `const sidebarRole = user ? (user.isStudent ? "นิสิต" : "เจ้าหน้าที่") : "admin";`

- [ ] **Step 6: `RequireAuth` และหน้า "ไม่มีสิทธิ์เข้าถึง" ใน `src/app/router.tsx`**

ลบ `import type { Role }` เพิ่ม `import { can, isStaff } from "./permissions";` แทน `RequireAuth` ด้วย

```tsx
function NoAccess() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-32 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">ไม่มีสิทธิ์เข้าถึง</h1>
      <p className="text-sm text-neutral-500">บัญชีนี้ยังไม่มีสิทธิ์ใช้หน้านี้ ติดต่อ IT Admin หากต้องการสิทธิ์</p>
    </div>
  );
}

/**
 * Signed-in users only. `permission` also requires that permission; `staff` requires any
 * `.view` permission (the /admin layout). Hides pages only: the API checks the same names.
 */
function RequireAuth({ children, permission, staff = false }: { children: ReactNode; permission?: string; staff?: boolean }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if ((permission && !can(user, permission)) || (staff && !isStaff(user))) return <NoAccess />;
  return <>{children}</>;
}

function StudentCourseChange() {
  const { user } = useAuth();
  const { search } = useLocation();
  if (can(user, "course_change.view")) return <Navigate to={`/admin/course-change${search}`} replace />;
  return (
    <RequireAuth permission="course_change.use">
      <DeferredPage>
        <CourseChangePage />
      </DeferredPage>
    </RequireAuth>
  );
}
```

ใน `AppRoutes`: `requests/new`, `requests` → `<RequireAuth permission="bookings.use">`; `admin` → `<RequireAuth staff>`; route ลูกของ `admin`:

| path | permission |
|---|---|
| `dashboard` | `bookings.view` |
| `data` | `masterdata.manage` |
| `course-change` | `course_change.view` |
| `receipts` | `receipts.view` |
| `announcements`, `announcements/:id` | `announcements.view` |
| `announcements/create`, `announcements/:id/edit` | `announcements.manage` |
| `news`, `news/:id` | `news.view` |
| `news/create`, `news/:id/edit` | `news.manage` |
| `storage/*` | ไม่ครอบ |

เช่น `<Route path="receipts" element={<RequireAuth permission="receipts.view"><ReceiptChecksPage /></RequireAuth>} />`

- [ ] **Step 7: เมนู `/admin` ตามสิทธิ์ (`AdminLayout.tsx`)**

```tsx
import { useAuth } from "@/app/AuthProvider";
import { can } from "@/app/permissions";

/** `permission` hides the item from users who cannot open it. Items without one show to all staff. */
const ADMIN_SIDEBAR_ITEMS: (SidebarItem & { permission?: string })[] = [
  { label: "หน้าหลัก", icon: <HomeIcon />, to: "/admin" },
  { label: "จัดการประกาศ", icon: <MegaphoneIcon />, to: "/admin/announcements", permission: "announcements.view" },
  { label: "จัดการข่าวประชาสัมพันธ์", icon: <NewspaperIcon />, to: "/admin/news", permission: "news.view" },
  { label: "จัดการห้องเรียน", icon: <CalendarIcon />, permission: "bookings.view" },
  { label: "ลด - ถอนรายวิชา", icon: <DocumentTextIcon />, to: "/admin/course-change", permission: "course_change.view" },
  { label: "จัดการคลังอุปกรณ์", icon: <CpuChipIcon />, to: "/admin/storage" },
  { label: "Receipt checks", icon: <DocumentMagnifyingGlassIcon />, to: RECEIPTS_PATH, permission: "receipts.view" },
];

export function AdminLayout() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const items = ADMIN_SIDEBAR_ITEMS.filter((item) => !item.permission || can(user, item.permission)).map(
    ({ permission: _permission, ...item }) => ({
      ...item,
      active:
        item.to === "/admin"
          ? pathname === item.to
          : item.to
            ? pathname.startsWith(item.to)
            : false,
    }),
  );
```

(ส่วน `return` คงเดิม)

- [ ] **Step 8: course change และ master data**

- `CourseChangePage.tsx`: `user?.role === "student"` → `!can(user, "course_change.view")`
- `WorkflowPanel.tsx`: `user?.role === "staff"` (บรรทัด 75, 92) → `can(user, "course_change.manage")`
- `MasterDataPage.tsx`: หัวตาราง `Role` → `บทบาท` เซลล์ `{row.roles.join(", ") || "—"}` ลบ field `role` ในฟอร์มสร้าง/แก้ผู้ใช้ (ถ้ามี)

- [ ] **Step 9: ตรวจและ commit**

```bash
grep -rn "\.role\b\|Role\b\|roles={" src | grep -v 'role="'
npm run typecheck
npm test
npm run build
git add src
git commit -m "feat(web): guard pages and menus with permissions instead of role"
```

Expected: grep ไม่มีผลลัพธ์ ทุกคำสั่งผ่าน

---

### Task A9: ตรวจรอบสุดท้ายของส่วน A

- [ ] **Step 1: backend จากฐานข้อมูลเปล่า**

```bash
cd prototype-1/backend
npm run test:fresh
npx tsc --noEmit
npx prisma migrate status
npx prisma migrate diff --from-schema-datasource prisma/schema --to-schema-datamodel prisma/schema --exit-code
```

Expected: ผ่านทั้งหมดยกเว้น BR-14, `Database schema is up to date!`, `No difference detected.`

- [ ] **Step 2: migration กับฐานข้อมูลที่มีข้อมูลเดิม**

checkout `origin/main` ใน worktree อื่น รัน `migrate deploy` และ `db:seed` บนฐานข้อมูลชื่อใหม่ แล้วกลับมาที่ branch นี้รัน `npx prisma migrate deploy` กับฐานข้อมูลนั้น แล้ว

```sql
SELECT count(*) FROM users u
WHERE u.student_no IS NULL
  AND NOT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.key = 'staff');
```

Expected: `0`

- [ ] **Step 3: ลองในเบราว์เซอร์**

| บัญชี | Expected |
|---|---|
| `admin@cedt.edu` | `/admin` เห็นทุกเมนูเหมือนก่อน |
| `student@test.local` | `/course-change` ได้, `/admin` ขึ้น "ไม่มีสิทธิ์เข้าถึง" |
| `teacher@test.local` | `/requests/new` ได้, `/admin` เห็นเฉพาะเมนูลด-ถอนรายวิชา |
| `audit@test.local` | `/admin` เห็นทุกเมนูที่มี `.view` แต่กดแก้แล้ว API ตอบ 403 |
| `norole@test.local` | เห็นแค่หน้าที่ไม่ต้องใช้สิทธิ์ |

- [ ] **Step 4: PR (เมื่อได้รับอนุญาต)**

"Core permissions (shared plan step 5a)" base `main` label `shared` สรุป "ตัดสินในแผนนี้" ผลตรวจ และขั้นตอนหลัง deploy `npm run roles:grant -- <email> it_admin` ท้าย body `🤖 Generated with [Claude Code](https://claude.com/claude-code)`

---

# ส่วน B: Permissions UI (5b) — branch `core/permissions-ui`

ตาม [spec หน้าจัดการสิทธิ์](../specs/2026-11-24-permissions-ui-design.md)

### Task B1: สร้าง branch

- [ ] **Step 1: แตก branch จากส่วน A**

```bash
git fetch origin
git switch -c core/permissions-ui core/permissions   # หรือ origin/main ถ้าส่วน A merge แล้ว
cd prototype-1/backend && npm ci && npx prisma generate && npm run test:fresh
cd ../frontend && npm ci && npm test
```

ส่วนนี้ไม่เขียน audit (ขั้นที่ 4 ยังไม่มี) บริการใน Task B3 รวบรวมรายการเปลี่ยนแปลง (`AccessChange[]`) ไว้ทุกครั้งที่บันทึก และส่งต่อให้ `recordChanges()` ซึ่งยังไม่ทำอะไร Task B8 ต่อเข้ากับ `audit()` หลังขั้นที่ 4 merge

---

### Task B2: แยกชื่อสิทธิ์เป็นแถวและคอลัมน์

**Files:**
- Create: `prototype-1/backend/src/core/permission-layout.ts`
- Test: `prototype-1/backend/test/core/access.test.ts` (ส่วน layout)

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

`test/core/access.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildCatalogRows, parsePermission } from "../../src/core/permission-layout.js";
import { permissionCatalog, permissionRowLabels } from "../../src/modules/index.js";

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
```

```bash
npm run test:fresh -- test/core/access.test.ts
```

Expected: FAIL

- [ ] **Step 2: สร้าง `src/core/permission-layout.ts`**

```ts
import type { PermissionDef } from "./permissions.js";

const LEVELS = ["use", "view", "manage"] as const;
export type PermissionLevel = (typeof LEVELS)[number];

export interface ParsedPermission {
  row: string;
  level: PermissionLevel;
  /** Only for "<row>.manage.<part>". */
  part: string | null;
}

/** The first use/view/manage token is the column; before it is the row; after manage. is the part. */
export function parsePermission(key: string): ParsedPermission | null {
  const tokens = key.split(".");
  const i = tokens.findIndex((t) => (LEVELS as readonly string[]).includes(t));
  if (i <= 0) return null;
  const level = tokens[i] as PermissionLevel;
  const rest = tokens.slice(i + 1);
  if (level !== "manage" && rest.length > 0) return null;
  return { row: tokens.slice(0, i).join("."), level, part: rest.length ? rest.join(".") : null };
}

export interface CatalogCell {
  key: string;
  label: string;
}

export interface CatalogRow {
  row: string;
  label: string;
  use?: CatalogCell;
  view?: CatalogCell;
  /** `key` is null when the module only declares manage parts (e.g. storage.manage.qc). */
  manage?: { key: string | null; label: string | null; parts: CatalogCell[] };
}

/** Rows for the permission table, in catalog order. */
export function buildCatalogRows(catalog: PermissionDef[], rowLabels: Record<string, string>): CatalogRow[] {
  const rows = new Map<string, CatalogRow>();
  for (const p of catalog) {
    const parsed = parsePermission(p.key);
    if (!parsed) continue;
    const row = rows.get(parsed.row) ?? { row: parsed.row, label: rowLabels[parsed.row] ?? parsed.row };
    const cell = { key: p.key, label: p.label };
    if (parsed.level === "manage") {
      row.manage ??= { key: null, label: null, parts: [] };
      if (parsed.part) row.manage.parts.push(cell);
      else Object.assign(row.manage, cell);
    } else {
      row[parsed.level] = cell;
    }
    rows.set(parsed.row, row);
  }
  return [...rows.values()];
}
```

- [ ] **Step 3: รันและ commit**

```bash
npm run test:fresh -- test/core/access.test.ts
npx tsc --noEmit
git add src/core/permission-layout.ts test/core/access.test.ts
git commit -m "feat(core): lay out permissions as table rows"
```

Expected: 4 test ผ่าน

---

### Task B3: บริการ `src/core/access.ts`

**Files:**
- Create: `prototype-1/backend/src/core/access.ts`
- Test: `prototype-1/backend/test/core/access.test.ts`

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

ต่อท้าย `test/core/access.test.ts` (รวม import ด้านบนของไฟล์)

```ts
import { afterAll, beforeAll } from "vitest";
import { createRole, getUserAccess, saveUserAccess, updateRole } from "../../src/core/access.js";
import { loadSessionUser, type SessionUser } from "../../src/core/permissions.js";
import { prisma } from "../../src/db.js";
import { idOf } from "../helpers/session.js";

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
```

```bash
npm run test:fresh -- test/core/access.test.ts
```

Expected: FAIL

- [ ] **Step 2: สร้าง `src/core/access.ts`**

```ts
import { Prisma } from "@prisma/client";
import { prisma, type Tx } from "../db.js";
import { conflict, duplicate, forbidden, notFound, validation } from "../lib/errors.js";
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

/**
 * Persists the changes of one save inside its transaction. Step 4 (audit) is not merged yet, so
 * this writes nothing for now; Task B8 makes it call audit() once per change.
 */
async function recordChanges(_tx: Tx, _actor: SessionUser, _changes: AccessChange[]): Promise<void> {}

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

/** Throws when removing it_admin from this user (or deactivating them) would leave no IT Admin. */
export async function assertNotLastItAdmin(tx: Tx, userId: string): Promise<void> {
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
    if (!(await tx.user.findUnique({ where: { id: userId }, select: { id: true } }))) throw notFound("ไม่พบผู้ใช้");
    const wantRoles = new Set(input.roleIds);
    const wantPerms = new Set(input.permissions);
    requireKnown([...wantPerms], known);

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
    const removePerms = currentDirect.filter((p) => !wantPerms.has(p.permission));
    if (addRoles.length + removeRoles.length + addPerms.length + removePerms.length === 0) return;

    const reason = requireReason(input.reason);
    for (const r of addRoles) {
      if (!r.isActive) throw validation(`บทบาท ${r.name} ปิดใช้งานอยู่`);
      requireHeld(actor, r.permissions.map((p) => p.permission));
    }
    requireHeld(actor, addPerms);
    if (removeRoles.some((a) => a.role.key === IT_ADMIN_ROLE)) {
      // Remove first, then check: the count below must not include this user any more.
      await tx.userRoleAssignment.deleteMany({ where: { userId, role: { key: IT_ADMIN_ROLE } } });
      const left = await tx.userRoleAssignment.count({ where: { role: { key: IT_ADMIN_ROLE }, user: { isActive: true } } });
      if (left === 0) throw conflict("ต้องมี IT Admin ที่ใช้งานอยู่อย่างน้อยหนึ่งคน");
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
        { action: "core.role.created", subjectType: "role", subjectId: role.id, after: { key: role.key, name, permissions }, note: reason },
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
    const role = await tx.role.findUnique({ where: { id }, include: roleInclude });
    if (!role) throw notFound("ไม่พบบทบาท");
    const before = toRoleView(role);
    const permissions = [...new Set(input.permissions)].sort();
    requireKnown(permissions, known);
    const name = input.name.trim();
    if (!name) throw validation("กรุณาระบุชื่อบทบาท");
    const description = input.description?.trim() || null;

    if (role.isSystem && !input.isActive) throw conflict("ปิดบทบาทระบบไม่ได้");
    const missing = (MUST_KEEP[role.key] ?? []).filter((p) => !permissions.includes(p));
    if (missing.length) throw conflict(`บทบาท ${role.name} ต้องมีสิทธิ์ ${missing.join(", ")}`);

    const added = permissions.filter((p) => !before.permissions.includes(p));
    const removed = before.permissions.filter((p) => !permissions.includes(p));
    const changed =
      added.length || removed.length || name !== role.name || description !== role.description || input.isActive !== role.isActive;
    if (!changed) return { role: before, changes: [] };
    const reason = requireReason(input.reason);
    requireHeld(actor, added);

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
```

- [ ] **Step 3: รันและ commit**

```bash
npm run test:fresh -- test/core/access.test.ts
npx tsc --noEmit
git add src/core/access.ts test/core/access.test.ts
git commit -m "feat(core): add access service for user roles, direct permissions and roles"
```

Expected: test ใน `access.test.ts` ผ่านทั้งหมด

---

### Task B4: route `/access/*` และกัน IT Admin คนสุดท้ายใน Master Data

**Files:**
- Create: `prototype-1/backend/src/modules/access/index.ts`, `src/modules/access/routes.ts`
- Modify: `prototype-1/backend/src/app.ts`, `src/modules/index.ts`, `src/modules/masterdata/routes.ts`, `test/modules.test.ts`
- Test: `prototype-1/backend/test/core/access.test.ts`

- [ ] **Step 1: เพิ่ม test ของ route**

ต่อท้าย `test/core/access.test.ts` (import `buildApp` และ `loginAs`)

```ts
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { loginAs } from "../helpers/session.js";

describe("/api/v1/access", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("is only for core.permissions.manage", async () => {
    const staff = await loginAs(app, "staff@test.local");
    expect((await app.inject({ method: "GET", url: "/api/v1/access/catalog", headers: { cookie: staff } })).statusCode).toBe(403);
    const admin = await loginAs(app, "itadmin@test.local");
    const res = await app.inject({ method: "GET", url: "/api/v1/access/catalog", headers: { cookie: admin } });
    expect(res.statusCode).toBe(200);
    expect(res.json().rows.find((r: { row: string }) => r.row === "core.users").label).toBe("ผู้ใช้");
  });

  it("saves through PUT and takes effect on the user's next request", async () => {
    const admin = await loginAs(app, "itadmin@test.local");
    const target = await loginAs(app, "norole@test.local");
    const getUsers = () => app.inject({ method: "GET", url: "/api/v1/users", headers: { cookie: target } });
    expect((await getUsers()).statusCode).toBe(403);
    const put = await app.inject({
      method: "PUT",
      url: `/api/v1/access/users/${norole}`,
      headers: { cookie: admin, "x-requested-with": "XMLHttpRequest" },
      payload: { roleIds: [], permissions: ["core.users.view"], reason: "ทดสอบ route" },
    });
    expect(put.statusCode).toBe(200);
    expect((await getUsers()).statusCode).toBe(200);
  });

  it("searches users by name, email or student number", async () => {
    const admin = await loginAs(app, "itadmin@test.local");
    const res = await app.inject({ method: "GET", url: "/api/v1/access/users?q=6800000001", headers: { cookie: admin } });
    expect(res.json().items.map((u: { email: string }) => u.email)).toContain("student@test.local");
  });

  it("refuses to deactivate the last IT Admin from Master Data", async () => {
    const admins = await prisma.userRoleAssignment.findMany({ where: { role: { key: "it_admin" } } });
    await prisma.userRoleAssignment.deleteMany({ where: { role: { key: "it_admin" }, userId: { not: itadmin.id } } });
    try {
      const staff = await loginAs(app, "staff@test.local");
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/users/${itadmin.id}`,
        headers: { cookie: staff, "x-requested-with": "XMLHttpRequest" },
        payload: { isActive: false },
      });
      expect(res.statusCode).toBe(409);
    } finally {
      for (const a of admins) {
        await prisma.userRoleAssignment.upsert({ where: { userId_roleId: { userId: a.userId, roleId: a.roleId } }, create: a, update: {} });
      }
    }
  });
});
```

```bash
npm run test:fresh -- test/core/access.test.ts
```

Expected: test ของ route FAIL ด้วย 404

- [ ] **Step 2: แนบ catalog กับ app ใน `src/app.ts`**

```ts
import { modules, permissionCatalog, permissionRowLabels } from "./modules/index.js";
```

ก่อนวนลูป `modules` เพิ่ม

```ts
  app.decorate("permissionCatalog", { catalog: permissionCatalog, rowLabels: permissionRowLabels, keys: knownPermissions });
```

และเพิ่มท้ายไฟล์

```ts
declare module "fastify" {
  interface FastifyInstance {
    /** Declared permissions, attached here so modules need not import modules/index.ts. */
    permissionCatalog: {
      catalog: import("./core/permissions.js").PermissionDef[];
      rowLabels: Record<string, string>;
      keys: ReadonlySet<string>;
    };
  }
}
```

- [ ] **Step 3: สร้าง `src/modules/access/routes.ts`**

```ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createRole, getRole, getUserAccess, listRoles, saveUserAccess, updateRole } from "../../core/access.js";
import { buildCatalogRows } from "../../core/permission-layout.js";
import { prisma } from "../../db.js";
import { requireUser } from "../../plugins/auth.js";

const MANAGE = { auth: "user", permission: "core.permissions.manage" } as const;
const idParam = z.object({ id: z.string().uuid() });
const reason = z.string().max(500).nullable().default(null);
const userSave = z.object({ roleIds: z.array(z.string().uuid()), permissions: z.array(z.string()), reason });
const roleCreate = z.object({
  key: z.string(),
  name: z.string().max(100),
  description: z.string().max(500).nullable().default(null),
  permissions: z.array(z.string()),
  reason: z.string().max(500),
});
const roleUpdate = roleCreate.omit({ key: true }).extend({ isActive: z.boolean(), reason });

export async function accessRoutes(app: FastifyInstance): Promise<void> {
  const { catalog, rowLabels, keys } = app.permissionCatalog;

  app.get("/access/catalog", { config: MANAGE }, async () => ({ rows: buildCatalogRows(catalog, rowLabels) }));

  app.get("/access/users", { config: MANAGE }, async (req) => {
    const { q } = z.object({ q: z.string().trim().max(100).default("") }).parse(req.query);
    if (!q) return { items: [] };
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { studentNo: { startsWith: q } },
        ],
      },
      include: { roles: { include: { role: { select: { name: true } } } } },
      orderBy: { name: "asc" },
      take: 10,
    });
    return {
      items: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        studentNo: u.studentNo,
        isActive: u.isActive,
        roles: u.roles.map((a) => a.role.name),
      })),
    };
  });

  app.get("/access/users/:id", { config: MANAGE }, async (req) => getUserAccess(idParam.parse(req.params).id));

  app.put("/access/users/:id", { config: MANAGE }, async (req) =>
    (await saveUserAccess(requireUser(req), idParam.parse(req.params).id, userSave.parse(req.body), keys)).access,
  );

  app.get("/access/roles", { config: MANAGE }, async () => ({ items: await listRoles() }));

  app.get("/access/roles/:id", { config: MANAGE }, async (req) => getRole(idParam.parse(req.params).id));

  app.post("/access/roles", { config: MANAGE }, async (req, reply) =>
    reply.code(201).send((await createRole(requireUser(req), roleCreate.parse(req.body), keys)).role),
  );

  app.put("/access/roles/:id", { config: MANAGE }, async (req) =>
    (await updateRole(requireUser(req), idParam.parse(req.params).id, roleUpdate.parse(req.body), keys)).role,
  );
}
```

ถ้า `studentNo` เป็น `Char(10)` แล้ว `startsWith` ใช้ไม่ได้ ให้ใช้ `contains` แทน

- [ ] **Step 4: `src/modules/access/index.ts` และรายชื่อโมดูล**

```ts
import { API_PREFIX, type AppModule } from "../types.js";
import { accessRoutes } from "./routes.js";

/** Role and permission management (/admin/access). Its permissions are core's (CORE_PERMISSIONS). */
export const accessModule: AppModule = {
  name: "core",
  async setup(app) {
    await app.register(accessRoutes, { prefix: API_PREFIX });
  },
};
```

ใน `src/modules/index.ts` import และต่อท้าย `modules` ด้วย `accessModule` ใน `test/modules.test.ts` เพิ่ม `core: ["GET", "/api/v1/access/catalog"],` ใน `SAMPLE_ROUTES`

- [ ] **Step 5: กัน IT Admin คนสุดท้ายใน `src/modules/masterdata/routes.ts`**

ใน `PATCH /users/:id` ภายใน `prisma.$transaction(async (tx) => {` ก่อน `tx.user.update` เพิ่ม

```ts
        if (body.isActive === false) await assertNotLastItAdmin(tx, id);
```

import `assertNotLastItAdmin` จาก `../../core/access.js`

- [ ] **Step 6: รันและ commit**

```bash
npx tsc --noEmit
npm run test:fresh
git add src test
git commit -m "feat(core): add /access routes for the permissions page"
```

Expected: ผ่านทั้งหมดยกเว้น BR-14

---

### Task B5: logic ของหน้าจัดการ (frontend)

**Files:**
- Create: `prototype-1/frontend/src/api/access.ts`
- Create: `prototype-1/frontend/src/features/access/matrix.ts`, `matrix.test.ts`

- [ ] **Step 1: สร้าง `src/api/access.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

export interface CatalogCell { key: string; label: string }
export interface CatalogRow {
  row: string;
  label: string;
  use?: CatalogCell;
  view?: CatalogCell;
  manage?: { key: string | null; label: string | null; parts: CatalogCell[] };
}
export interface AccessUserHit { id: string; name: string; email: string; studentNo: string | null; isActive: boolean; roles: string[] }
export interface UserAccessView {
  user: { id: string; name: string; email: string; studentNo: string | null; isActive: boolean };
  roles: { id: string; key: string; name: string; isActive: boolean }[];
  direct: { permission: string; reason: string; grantedBy: string | null; createdAt: string }[];
  effective: { permission: string; sources: string[] }[];
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
export interface RoleDetail extends RoleView { members: { id: string; name: string; email: string }[] }

const keys = {
  catalog: ["access", "catalog"] as const,
  search: (q: string) => ["access", "users", q] as const,
  user: (id: string) => ["access", "user", id] as const,
  roles: ["access", "roles"] as const,
  role: (id: string) => ["access", "role", id] as const,
};

export const useAccessCatalog = () =>
  useQuery({ queryKey: keys.catalog, queryFn: () => api<{ rows: CatalogRow[] }>("/access/catalog"), staleTime: Infinity });

export const useAccessUserSearch = (q: string) =>
  useQuery({
    queryKey: keys.search(q),
    queryFn: () => api<{ items: AccessUserHit[] }>(`/access/users?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length > 0,
  });

export const useUserAccess = (id: string | null) =>
  useQuery({ queryKey: keys.user(id ?? ""), queryFn: () => api<UserAccessView>(`/access/users/${id}`), enabled: !!id });

export const useRoles = () => useQuery({ queryKey: keys.roles, queryFn: () => api<{ items: RoleView[] }>("/access/roles") });

export const useRole = (id: string | null) =>
  useQuery({ queryKey: keys.role(id ?? ""), queryFn: () => api<RoleDetail>(`/access/roles/${id}`), enabled: !!id });

export function useSaveUserAccess(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { roleIds: string[]; permissions: string[]; reason: string }) =>
      api<UserAccessView>(`/access/users/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: (data) => {
      qc.setQueryData(keys.user(id), data);
      void qc.invalidateQueries({ queryKey: ["access", "users"] });
      void qc.invalidateQueries({ queryKey: keys.roles });
    },
  });
}

export function useSaveRole(id: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { key?: string; name: string; description: string | null; permissions: string[]; isActive?: boolean; reason: string }) =>
      id
        ? api<RoleView>(`/access/roles/${id}`, { method: "PUT", body: JSON.stringify(body) })
        : api<RoleView>("/access/roles", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["access"] }),
  });
}
```

- [ ] **Step 2: เขียน test ของ `matrix.ts` ที่ยังไม่ผ่าน**

`src/features/access/matrix.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { CatalogRow, RoleView } from "@/api/access";
import { cellKeys, diffDraft, draftSources, isGivable } from "./matrix";

const role = (id: string, name: string, permissions: string[], key = id): RoleView => ({
  id, key, name, description: null, isSystem: false, isActive: true, permissions, userCount: 0,
});
const roles = [
  role("r1", "อาจารย์", ["bookings.use", "course_change.view"]),
  role("r2", "Audit", ["course_change.view", "receipts.view"]),
  role("s", "นิสิต", ["course_change.use"], "student"),
];

describe("cellKeys", () => {
  it("lists every key of a row, including manage parts", () => {
    const row: CatalogRow = {
      row: "course_change",
      label: "ลด-ถอนรายวิชา",
      use: { key: "course_change.use", label: "" },
      manage: { key: "course_change.manage", label: "", parts: [{ key: "course_change.manage.advise", label: "" }] },
    };
    expect(cellKeys(row)).toEqual(["course_change.use", "course_change.manage", "course_change.manage.advise"]);
  });
});

describe("draftSources", () => {
  it("combines draft roles, the student role and direct permissions", () => {
    const draft = { roleIds: ["r1", "r2"], permissions: ["course_change.view", "news.view"] };
    expect(draftSources(draft, roles, true).get("course_change.view")).toEqual(["อาจารย์", "Audit", "direct"]);
    expect(draftSources(draft, roles, true).get("course_change.use")).toEqual(["นิสิต"]);
    expect(draftSources(draft, roles, false).has("course_change.use")).toBe(false);
  });
});

describe("diffDraft", () => {
  it("counts added and removed roles and permissions", () => {
    const d = diffDraft({ roleIds: ["r1"], permissions: ["a.view"] }, { roleIds: ["r2"], permissions: ["a.view", "b.view"] });
    expect(d).toEqual({ addRoles: ["r2"], removeRoles: ["r1"], addPermissions: ["b.view"], removePermissions: [], count: 3 });
  });
});

describe("isGivable", () => {
  it("allows only permissions the actor holds", () => {
    expect(isGivable(["a.view", "b.view"], ["a.view"])).toBe(true);
    expect(isGivable(["a.view"], ["a.view", "b.view"])).toBe(false);
  });
});
```

```bash
cd prototype-1/frontend
npx vitest run src/features/access/matrix.test.ts
```

Expected: FAIL

- [ ] **Step 3: สร้าง `src/features/access/matrix.ts`**

```ts
import type { CatalogRow, RoleView } from "@/api/access";

export interface Draft {
  roleIds: string[];
  permissions: string[];
}

/** Every permission key shown in a row (use, view, manage, manage parts). */
export function cellKeys(row: CatalogRow): string[] {
  return [row.use?.key, row.view?.key, row.manage?.key, ...(row.manage?.parts.map((p) => p.key) ?? [])].filter(
    (k): k is string => !!k,
  );
}

/** permission → its sources in the draft: role names (draft order), "นิสิต" (automatic), "direct". */
export function draftSources(draft: Draft, roles: RoleView[], isStudent: boolean): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (p: string, s: string) => out.set(p, [...(out.get(p) ?? []), s]);
  for (const id of draft.roleIds) {
    const r = roles.find((x) => x.id === id);
    if (r?.isActive) for (const p of r.permissions) add(p, r.name);
  }
  if (isStudent) {
    const student = roles.find((r) => r.key === "student");
    if (student?.isActive) for (const p of student.permissions) add(p, student.name);
  }
  for (const p of draft.permissions) add(p, "direct");
  return out;
}

export function diffDraft(saved: Draft, draft: Draft) {
  const minus = (a: string[], b: string[]) => a.filter((x) => !b.includes(x));
  const addRoles = minus(draft.roleIds, saved.roleIds);
  const removeRoles = minus(saved.roleIds, draft.roleIds);
  const addPermissions = minus(draft.permissions, saved.permissions);
  const removePermissions = minus(saved.permissions, draft.permissions);
  return {
    addRoles,
    removeRoles,
    addPermissions,
    removePermissions,
    count: addRoles.length + removeRoles.length + addPermissions.length + removePermissions.length,
  };
}

/** True when the actor holds every permission (rule: you cannot give what you do not have). */
export const isGivable = (permissions: string[], actorPermissions: readonly string[]): boolean =>
  permissions.every((p) => actorPermissions.includes(p));
```

- [ ] **Step 4: รันและ commit**

```bash
npx vitest run src/features/access/matrix.test.ts
npm run typecheck
git add src/api/access.ts src/features/access/matrix.ts src/features/access/matrix.test.ts
git commit -m "feat(web): add access API hooks and permission matrix logic"
```

Expected: 4 test ผ่าน

---

### Task B6: หน้าจัดการ `/admin/access`

**Files:**
- Create: `prototype-1/frontend/src/features/access/{PermissionMatrix,SaveChangesDialog,UserAccess,RoleEditor,AccessPage}.tsx`
- Modify: `prototype-1/frontend/src/app/router.tsx`, `src/features/admin/layout/AdminLayout.tsx`

- [ ] **Step 1: `PermissionMatrix.tsx`**

```tsx
import type { CatalogCell, CatalogRow } from "@/api/access";

export interface CellState {
  checked: boolean;
  /** Ticked by a role (or the automatic student role): cannot be toggled here. */
  locked: boolean;
  /** The current user may not give it. */
  disabled: boolean;
  /** Names shown next to the box, e.g. "อาจารย์, Audit". */
  sources: string[];
  change: "added" | "removed" | null;
}

function Box({ cell, state, onToggle }: { cell: CatalogCell; state: CellState; onToggle: (key: string) => void }) {
  const tone = state.change === "added" ? "text-green-700" : state.change === "removed" ? "text-red-700 line-through" : "";
  return (
    <label className={`flex items-start gap-1.5 text-xs ${tone}`} title={cell.label}>
      <input
        type="checkbox"
        className="mt-0.5"
        checked={state.checked}
        disabled={state.locked || state.disabled}
        onChange={() => onToggle(cell.key)}
        aria-label={cell.label}
      />
      <span>
        {state.locked && "🔒 "}
        {state.sources.filter((s) => s !== "direct").join(", ") || (state.checked ? "รายคน" : "")}
      </span>
    </label>
  );
}

/** Module × use/view/manage table. Used for a user (with locks) and for a role (no locks). */
export function PermissionMatrix({
  rows,
  stateOf,
  onToggle,
}: {
  rows: CatalogRow[];
  stateOf: (key: string) => CellState;
  onToggle: (key: string) => void;
}) {
  const cell = (c: CatalogCell | undefined) => (c ? <Box cell={c} state={stateOf(c.key)} onToggle={onToggle} /> : <span className="text-neutral-400">—</span>);
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left text-neutral-600">
          <th className="py-2 pr-3 font-medium">หมวด</th>
          <th className="py-2 pr-3 font-medium">ใช้งาน</th>
          <th className="py-2 pr-3 font-medium">ดู</th>
          <th className="py-2 font-medium">จัดการ</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.row} className="border-b align-top">
            <td className="py-2 pr-3">{r.label}</td>
            <td className="py-2 pr-3">{cell(r.use)}</td>
            <td className="py-2 pr-3">{cell(r.view)}</td>
            <td className="space-y-1 py-2">
              {r.manage ? (
                <>
                  {r.manage.key && cell({ key: r.manage.key, label: r.manage.label ?? r.manage.key })}
                  {r.manage.parts.map((p) => (
                    <div key={p.key} className="flex items-center gap-1">
                      <span className="text-xs text-neutral-500">{p.label}:</span>
                      {cell(p)}
                    </div>
                  ))}
                </>
              ) : (
                <span className="text-neutral-400">—</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: `SaveChangesDialog.tsx`**

```tsx
import { useState } from "react";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/** Confirms a batch of changes with one required reason. Keeps the draft when the API refuses. */
export function SaveChangesDialog({
  open,
  title,
  changes,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  changes: string[];
  onClose: () => void;
  onConfirm: (reason: string) => Promise<unknown>;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      setReason("");
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {changes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <label className="text-sm font-medium" htmlFor="access-reason">
          เหตุผล (บังคับ)
        </label>
        <Textarea id="access-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>ยกเลิก</Button>
          <Button onClick={() => void confirm()} disabled={busy || !reason.trim()}>{busy ? "กำลังบันทึก…" : "ยืนยัน"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: `UserAccess.tsx`**

```tsx
import { useEffect, useMemo, useState } from "react";
import { useAccessCatalog, useAccessUserSearch, useRoles, useSaveUserAccess, useUserAccess } from "@/api/access";
import { useAuth } from "@/app/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { diffDraft, draftSources, isGivable, type Draft } from "./matrix";
import { PermissionMatrix } from "./PermissionMatrix";
import { SaveChangesDialog } from "./SaveChangesDialog";

function useDebounced(value: string, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function UserAccess({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const { user: me } = useAuth();
  const [query, setQuery] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ roleIds: [], permissions: [] });
  const [saving, setSaving] = useState(false);
  const search = useAccessUserSearch(useDebounced(query));
  const catalog = useAccessCatalog();
  const roles = useRoles();
  const access = useUserAccess(userId);
  const save = useSaveUserAccess(userId ?? "");

  const saved = useMemo<Draft>(
    () => ({ roleIds: access.data?.roles.map((r) => r.id) ?? [], permissions: access.data?.direct.map((d) => d.permission) ?? [] }),
    [access.data],
  );
  useEffect(() => setDraft(saved), [saved]);
  const diff = diffDraft(saved, draft);
  useEffect(() => onDirtyChange(diff.count > 0), [diff.count, onDirtyChange]);

  const allRoles = roles.data?.items ?? [];
  const actorPerms = me?.permissions ?? [];
  const isStudent = !!access.data?.user.studentNo;
  const sources = draftSources(draft, allRoles, isStudent);
  const savedSources = draftSources(saved, allRoles, isStudent);
  const roleName = (id: string) => allRoles.find((r) => r.id === id)?.name ?? id;

  function choose(id: string) {
    if (diff.count > 0 && !window.confirm("มีการเปลี่ยนแปลงที่ยังไม่บันทึก ต้องการทิ้งการเปลี่ยนแปลงหรือไม่")) return;
    setUserId(id);
    setQuery("");
  }

  const toggle = (key: string) =>
    setDraft((d) => ({
      ...d,
      permissions: d.permissions.includes(key) ? d.permissions.filter((p) => p !== key) : [...d.permissions, key],
    }));

  const changes = [
    ...diff.addRoles.map((id) => `+ บทบาท ${roleName(id)}`),
    ...diff.removeRoles.map((id) => `− บทบาท ${roleName(id)}`),
    ...diff.addPermissions.map((p) => `+ สิทธิ์รายคน ${p}`),
    ...diff.removePermissions.map((p) => `− สิทธิ์รายคน ${p}`),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <div className="relative flex-1">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาชื่อ อีเมล รหัสนิสิต" />
          {query && search.data && (
            <ul className="absolute z-10 mt-1 w-full rounded-md border bg-white shadow">
              {search.data.items.length === 0 && <li className="px-3 py-2 text-sm text-neutral-500">ไม่พบผู้ใช้</li>}
              {search.data.items.map((u) => (
                <li key={u.id}>
                  <button type="button" className={`w-full px-3 py-2 text-left text-sm hover:bg-neutral-100 ${u.isActive ? "" : "text-neutral-400"}`} onClick={() => choose(u.id)}>
                    {u.name} · {u.studentNo ?? u.email} {u.roles.length > 0 && `· ${u.roles.join(", ")}`}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Button disabled={diff.count === 0} onClick={() => setSaving(true)}>บันทึก ({diff.count})</Button>
      </div>

      {access.data && catalog.data && (
        <>
          <section className="space-y-2 border-t pt-3">
            <p className="text-sm">
              <b>{access.data.user.name}</b> · {access.data.user.email} · {access.data.user.isActive ? "ใช้งานอยู่" : "ปิดใช้งาน"}
              {access.data.user.studentNo && ` · ${access.data.user.studentNo} · นิสิต (อัตโนมัติ)`}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>บทบาท:</span>
              {[...saved.roleIds, ...diff.addRoles].map((id) => {
                const removed = diff.removeRoles.includes(id);
                const added = diff.addRoles.includes(id);
                return (
                  <span key={id} className={`rounded border px-2 py-0.5 ${added ? "border-green-600 text-green-700" : ""} ${removed ? "border-red-600 text-red-700 line-through" : ""}`}>
                    {roleName(id)}{" "}
                    <button
                      type="button"
                      aria-label={removed ? `คืนบทบาท ${roleName(id)}` : `ถอนบทบาท ${roleName(id)}`}
                      onClick={() => setDraft((d) => ({ ...d, roleIds: removed ? [...d.roleIds, id] : d.roleIds.filter((r) => r !== id) }))}
                    >
                      {removed ? "↺" : "✕"}
                    </button>
                  </span>
                );
              })}
              <select
                className="rounded border px-2 py-1"
                value=""
                onChange={(e) => e.target.value && setDraft((d) => ({ ...d, roleIds: [...d.roleIds, e.target.value] }))}
              >
                <option value="">+ เพิ่มบทบาท</option>
                {allRoles
                  .filter((r) => r.isActive && r.key !== "student" && !draft.roleIds.includes(r.id))
                  .map((r) => (
                    <option key={r.id} value={r.id} disabled={!isGivable(r.permissions, actorPerms)}>
                      {r.name}{isGivable(r.permissions, actorPerms) ? "" : " (ให้ได้เฉพาะสิทธิ์ที่คุณมี)"}
                    </option>
                  ))}
              </select>
            </div>
          </section>

          <PermissionMatrix
            rows={catalog.data.rows}
            onToggle={toggle}
            stateOf={(key) => {
              const s = sources.get(key) ?? [];
              const before = savedSources.get(key) ?? [];
              const locked = s.some((x) => x !== "direct");
              const direct = draft.permissions.includes(key);
              return {
                checked: s.length > 0,
                locked,
                disabled: !direct && !isGivable([key], actorPerms),
                sources: s,
                change: s.length > 0 && before.length === 0 ? "added" : s.length === 0 && before.length > 0 ? "removed" : null,
              };
            }}
          />
        </>
      )}

      <SaveChangesDialog
        open={saving}
        title={`ยืนยันการเปลี่ยนสิทธิ์ของ ${access.data?.user.name ?? ""}`}
        changes={changes}
        onClose={() => setSaving(false)}
        onConfirm={(reason) => save.mutateAsync({ ...draft, reason })}
      />
    </div>
  );
}
```

- [ ] **Step 4: `RoleEditor.tsx`**

```tsx
import { useEffect, useMemo, useState } from "react";
import { useAccessCatalog, useRole, useRoles, useSaveRole } from "@/api/access";
import { useAuth } from "@/app/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isGivable } from "./matrix";
import { PermissionMatrix } from "./PermissionMatrix";
import { SaveChangesDialog } from "./SaveChangesDialog";

interface RoleDraft { key: string; name: string; description: string; isActive: boolean; permissions: string[] }
const EMPTY: RoleDraft = { key: "", name: "", description: "", isActive: true, permissions: [] };

export function RoleEditor({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const { user: me } = useAuth();
  const [roleId, setRoleId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<RoleDraft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const roles = useRoles();
  const role = useRole(roleId);
  const catalog = useAccessCatalog();
  const save = useSaveRole(creating ? null : roleId);

  const saved = useMemo<RoleDraft>(
    () =>
      role.data && !creating
        ? { key: role.data.key, name: role.data.name, description: role.data.description ?? "", isActive: role.data.isActive, permissions: role.data.permissions }
        : EMPTY,
    [role.data, creating],
  );
  useEffect(() => setDraft(saved), [saved]);
  const added = draft.permissions.filter((p) => !saved.permissions.includes(p));
  const removed = saved.permissions.filter((p) => !draft.permissions.includes(p));
  const fieldChanges = [
    draft.key !== saved.key && creating ? `key ${draft.key}` : null,
    draft.name !== saved.name ? `ชื่อ: ${draft.name}` : null,
    draft.description !== saved.description ? "คำอธิบาย" : null,
    draft.isActive !== saved.isActive ? (draft.isActive ? "เปิดใช้งาน" : "ปิดใช้งาน") : null,
  ].filter((c): c is string => !!c);
  const changes = [...fieldChanges, ...added.map((p) => `+ ${p}`), ...removed.map((p) => `− ${p}`)];
  const dirty = changes.length > 0;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  function pick(next: string | null, create = false) {
    if (dirty && !window.confirm("มีการเปลี่ยนแปลงที่ยังไม่บันทึก ต้องการทิ้งการเปลี่ยนแปลงหรือไม่")) return;
    setCreating(create);
    setRoleId(next);
    if (create) setDraft(EMPTY);
  }

  const showEditor = creating || !!role.data;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <select className="flex-1 rounded border px-2 py-2 text-sm" value={creating ? "" : roleId ?? ""} onChange={(e) => pick(e.target.value || null)}>
          <option value="">เลือกบทบาท</option>
          {roles.data?.items.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.key}) · {r.userCount} คน{r.isActive ? "" : " · ปิดใช้งาน"}
            </option>
          ))}
        </select>
        <Button variant="outline" onClick={() => pick(null, true)}>+ สร้างบทบาท</Button>
        <Button disabled={!dirty} onClick={() => setSaving(true)}>บันทึก ({changes.length})</Button>
      </div>

      {showEditor && catalog.data && (
        <>
          <section className="grid gap-2 border-t pt-3 text-sm sm:grid-cols-2">
            {creating ? (
              <Input placeholder="key เช่น storage_staff" value={draft.key} onChange={(e) => setDraft({ ...draft, key: e.target.value })} />
            ) : (
              <p className="self-center">
                key: <code>{saved.key}</code> {role.data?.isSystem && <Badge>ระบบ</Badge>}
              </p>
            )}
            <Input placeholder="ชื่อบทบาท" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <Textarea className="sm:col-span-2" placeholder="คำอธิบาย" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            {!creating && !role.data?.isSystem && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
                เปิดใช้งาน
              </label>
            )}
            {!creating && role.data && (
              <p className="sm:col-span-2 text-neutral-600">
                สมาชิก: {role.data.members.map((m) => m.name).join(", ") || "—"} (เพิ่มหรือถอนที่แท็บผู้ใช้)
              </p>
            )}
          </section>

          <PermissionMatrix
            rows={catalog.data.rows}
            onToggle={(key) =>
              setDraft((d) => ({ ...d, permissions: d.permissions.includes(key) ? d.permissions.filter((p) => p !== key) : [...d.permissions, key] }))
            }
            stateOf={(key) => {
              const checked = draft.permissions.includes(key);
              return {
                checked,
                locked: false,
                disabled: !checked && !isGivable([key], me?.permissions ?? []),
                sources: [],
                change: added.includes(key) ? "added" : removed.includes(key) ? "removed" : null,
              };
            }}
          />
        </>
      )}

      <SaveChangesDialog
        open={saving}
        title={creating ? "ยืนยันการสร้างบทบาท" : `ยืนยันการแก้บทบาท ${saved.name}`}
        changes={changes}
        onClose={() => setSaving(false)}
        onConfirm={async (reason) => {
          const body = { name: draft.name, description: draft.description || null, permissions: draft.permissions, reason };
          const result = await save.mutateAsync(creating ? { ...body, key: draft.key } : { ...body, isActive: draft.isActive });
          if (creating) {
            setCreating(false);
            setRoleId(result.id);
          }
        }}
      />
    </div>
  );
}
```

- [ ] **Step 5: `AccessPage.tsx`**

```tsx
import { useCallback, useEffect, useState } from "react";
import { RoleEditor } from "./RoleEditor";
import { UserAccess } from "./UserAccess";

/** /admin/access: user permissions and role presets (spec 2026-11-24-permissions-ui-design). */
export function AccessPage() {
  const [tab, setTab] = useState<"users" | "roles">("users");
  const [dirty, setDirty] = useState(false);
  const onDirtyChange = useCallback((d: boolean) => setDirty(d), []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function switchTo(next: "users" | "roles") {
    if (next === tab) return;
    if (dirty && !window.confirm("มีการเปลี่ยนแปลงที่ยังไม่บันทึก ต้องการทิ้งการเปลี่ยนแปลงหรือไม่")) return;
    setDirty(false);
    setTab(next);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">สิทธิ์ผู้ใช้</h1>
      <div className="flex gap-2 border-b" role="tablist">
        {(["users", "roles"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`px-3 py-2 text-sm ${tab === t ? "border-b-2 border-brand-primary font-semibold" : "text-neutral-500"}`}
            onClick={() => switchTo(t)}
          >
            {t === "users" ? "ผู้ใช้" : "บทบาท"}
          </button>
        ))}
      </div>
      {tab === "users" ? <UserAccess onDirtyChange={onDirtyChange} /> : <RoleEditor onDirtyChange={onDirtyChange} />}
    </div>
  );
}
```

- [ ] **Step 6: route และเมนู**

`src/app/router.tsx`: เพิ่ม lazy import แบบเดียวกับหน้าอื่น

```tsx
const AccessPage = lazy(() =>
  import("@/features/access/AccessPage").then((module) => ({ default: module.AccessPage })),
);
```

และในกลุ่ม route ของ `admin`

```tsx
          <Route path="access" element={<RequireAuth permission="core.permissions.manage"><AccessPage /></RequireAuth>} />
```

`AdminLayout.tsx`: import `KeyIcon` จาก `@heroicons/react/24/outline` และเพิ่มท้าย `ADMIN_SIDEBAR_ITEMS`

```tsx
  { label: "สิทธิ์ผู้ใช้", icon: <KeyIcon />, to: "/admin/access", permission: "core.permissions.manage" },
```

- [ ] **Step 7: ตรวจและ commit**

```bash
npm run typecheck
npm test
npm run build
git add src
git commit -m "feat(web): add the /admin/access permissions page"
```

Expected: ผ่านทั้งหมด

---

### Task B7: ตรวจรอบสุดท้ายของส่วน B

- [ ] **Step 1: test ทั้งหมด**

```bash
cd prototype-1/backend && npm run test:fresh && npx tsc --noEmit
cd ../frontend && npm run typecheck && npm test && npm run build
```

- [ ] **Step 2: ลองในเบราว์เซอร์**

- ล็อกอิน `admin@cedt.edu` (มีทั้ง role `staff` และ `it_admin` จึงให้ Audit ได้) เปิด `/admin/access` ค้น `teacher` เลือก `teacher@test.local` เพิ่มบทบาท Audit เห็นช่องใหม่เป็นสีเขียวพร้อมที่มา กด "บันทึก (1)" ใส่เหตุผล ยืนยัน
- ล็อกอิน `teacher@test.local` เห็นเมนูประกาศ ข่าว และใบเสร็จเพิ่มขึ้น
- ล็อกอิน `itadmin@test.local` เห็นบทบาท Audit ใน dropdown เป็น "(ให้ได้เฉพาะสิทธิ์ที่คุณมี)" และกดไม่ได้
- ในฐานข้อมูลทดสอบที่ถอน `it_admin` ของคนอื่นออกจนเหลือคนเดียว ลองถอนบทบาท IT Admin ของตัวเอง เห็นข้อความ "ต้องมี IT Admin ที่ใช้งานอยู่อย่างน้อยหนึ่งคน" และร่างยังอยู่
- แท็บบทบาท: สร้างบทบาท `storage_helper` ติ๊ก `core.users.view` บันทึก แล้วเห็นในรายการ

- [ ] **Step 3: PR (เมื่อได้รับอนุญาต)**

"Permissions page (shared plan step 5b)" base `main` (หรือ `core/permissions` ถ้าส่วน A ยังไม่ merge) label `shared` อ้างอิง spec สรุปผลตรวจ และบอกว่ายังไม่เขียน audit จนกว่าขั้นที่ 4 merge (Task B8) ท้าย body `🤖 Generated with [Claude Code](https://claude.com/claude-code)`

---

### Task B8: ต่อ audit (ทำเมื่อขั้นที่ 4 merge แล้ว)

**Files:**
- Modify: `prototype-1/backend/src/core/access.ts` (`recordChanges`)
- Test: `prototype-1/backend/test/core/access.test.ts`

- [ ] **Step 1: rebase และดู `audit()` ของขั้นที่ 4**

```bash
git fetch origin
git rebase origin/main
cd prototype-1/backend
grep -n "export async function audit\|export function audit" -A12 src/core/audit.ts
```

- [ ] **Step 2: เพิ่ม test ที่ยังไม่ผ่าน**

ต่อท้าย `describe("saveUserAccess")` ใน `test/core/access.test.ts`

```ts
  it("writes one audit row per change, with the reason as the note", async () => {
    const before = await prisma.auditLog.count({ where: { subjectId: norole } });
    const { changes } = await saveUserAccess(itadmin, norole, { roleIds: [], permissions: ["core.import.manage"], reason: "ทดสอบ audit" }, known);
    const rows = await prisma.auditLog.findMany({ where: { subjectId: norole }, orderBy: { createdAt: "desc" }, take: changes.length });
    expect((await prisma.auditLog.count({ where: { subjectId: norole } })) - before).toBe(changes.length);
    expect(rows.every((r) => r.note === "ทดสอบ audit" && r.actorId === itadmin.id)).toBe(true);
  });
```

ชื่อ model (`auditLog`) และคอลัมน์ (`subjectId`, `note`, `actorId`) ตามแผนของกลางหัวข้อ 3.6 ถ้าขั้นที่ 4 ตั้งชื่อต่าง ให้แก้ตาม

```bash
npm run test:fresh -- test/core/access.test.ts
```

Expected: FAIL (ยังไม่มีแถว audit)

- [ ] **Step 3: แก้ `recordChanges` ใน `src/core/access.ts`**

```ts
import { audit } from "./audit.js";
```

```ts
/** Writes one audit row per change inside the save's transaction (shared plan 2.8). */
async function recordChanges(tx: Tx, actor: SessionUser, changes: AccessChange[]): Promise<void> {
  for (const c of changes) await audit(tx, { actorId: actor.id, module: "core", ...c });
}
```

ถ้า `audit()` ของขั้นที่ 4 รับ argument ต่างจากนี้ (เช่น ไม่มี `module`) ให้ปรับเฉพาะในฟังก์ชันนี้

- [ ] **Step 4: role `audit` เห็นหน้า audit (ถ้าขั้นที่ 4 ประกาศ `audit.view`)**

สร้าง migration ใหม่ `<timestamp>_audit_role_view/migration.sql`

```sql
-- The audit role can read the audit log (shared plan 1.2).
INSERT INTO "role_permissions" ("role_id", "permission")
SELECT r."id", 'audit.view' FROM "roles" r WHERE r."key" = 'audit'
ON CONFLICT DO NOTHING;
```

- [ ] **Step 5: รันและ commit**

```bash
npx tsc --noEmit
npm run test:fresh
git add src test prisma
git commit -m "feat(core): write audit rows for role and permission changes"
```

Expected: ผ่านทั้งหมดยกเว้น BR-14

---

# ส่วน C: Dev switcher (5c) — branch `core/dev-switcher`

### Task C1: สร้าง branch

- [ ] **Step 1: แตก branch จากส่วน A**

```bash
git fetch origin
git switch -c core/dev-switcher core/permissions   # หรือ origin/main ถ้าส่วน A merge แล้ว
cd prototype-1/backend && npm ci && npx prisma generate && npm run test:fresh
```

---

### Task C2: config และ `startSession()`

**Files:**
- Modify: `prototype-1/backend/src/config.ts`, `src/plugins/auth.ts`, `src/modules/auth/routes.ts`, `src/modules/types.ts`, `.env.example`
- Test: `prototype-1/backend/test/core/dev-login.test.ts`

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

`test/core/dev-login.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { devLoginAllowed } from "../../src/config.js";

describe("devLoginAllowed", () => {
  it("is on only outside production with DEV_LOGIN_AS", () => {
    expect(devLoginAllowed({ NODE_ENV: "development", DEV_LOGIN_AS: true })).toBe(true);
    expect(devLoginAllowed({ NODE_ENV: "development", DEV_LOGIN_AS: false })).toBe(false);
    expect(devLoginAllowed({ NODE_ENV: "production", DEV_LOGIN_AS: false })).toBe(false);
  });

  it("refuses to start production with DEV_LOGIN_AS", () => {
    expect(() => devLoginAllowed({ NODE_ENV: "production", DEV_LOGIN_AS: true })).toThrow(/DEV_LOGIN_AS/);
  });
});
```

```bash
npm run test:fresh -- test/core/dev-login.test.ts
```

Expected: FAIL

- [ ] **Step 2: `src/config.ts`**

ใน `schema` เพิ่ม

```ts
  // Dev/demo only: POST /api/v1/dev/login-as switches to any @test.local account (shared plan 2.11).
  DEV_LOGIN_AS: flag.transform((v) => v === "true" || v === "1"),
```

ท้ายไฟล์

```ts
/** Whether the dev user switcher is registered. Production with DEV_LOGIN_AS is a startup error. */
export function devLoginAllowed(env: { NODE_ENV: string; DEV_LOGIN_AS: boolean }): boolean {
  if (env.NODE_ENV === "production" && env.DEV_LOGIN_AS) {
    throw new Error("DEV_LOGIN_AS must not be set in production");
  }
  return env.DEV_LOGIN_AS;
}
export const devLoginEnabled = devLoginAllowed(config);
```

`.env.example` ของ backend เพิ่ม

```
# Dev/demo only: lets the DEV bar switch to any @test.local account. Never in production.
DEV_LOGIN_AS=false
```

- [ ] **Step 3: `startSession()` ใน `src/plugins/auth.ts`**

```ts
/** Creates a session for the user and sets the cookie (login and the dev switcher). */
export async function startSession(reply: FastifyReply, userId: string): Promise<void> {
  const { raw, hash } = newSessionToken();
  await prisma.session.create({
    data: { userId, tokenHash: hash, expiresAt: new Date(Date.now() + config.SESSION_TTL_HOURS * 3_600_000) },
  });
  setSessionCookie(reply, raw);
}
```

ใน `/auth/login` แทนบล็อกที่สร้าง session และเรียก `setSessionCookie` ด้วย `await startSession(reply, user.id);` (ลบ import `newSessionToken`, `setSessionCookie` ที่ไม่ใช้แล้ว)

- [ ] **Step 4: `BuildOptions.devLoginAs` ใน `src/modules/types.ts`**

```ts
export interface BuildOptions {
  /** Tests pass a fake LINE client so no request leaves the process. */
  lineClient?: LineClient;
  /** Tests force the dev switcher on or off; otherwise DEV_LOGIN_AS decides. */
  devLoginAs?: boolean;
}
```

- [ ] **Step 5: รันและ commit**

```bash
npm run test:fresh -- test/core/dev-login.test.ts
npx tsc --noEmit
npm run test:fresh
git add src .env.example test/core/dev-login.test.ts
git commit -m "feat(dev): add DEV_LOGIN_AS config and a shared startSession()"
```

---

### Task C3: route `/dev/accounts` และ `/dev/login-as`

**Files:**
- Create: `prototype-1/backend/src/modules/dev/index.ts`, `src/modules/dev/routes.ts`
- Modify: `prototype-1/backend/src/modules/index.ts`, `test/modules.test.ts`
- Test: `prototype-1/backend/test/core/dev-login.test.ts`

- [ ] **Step 1: เพิ่ม test**

ต่อท้าย `test/core/dev-login.test.ts`

```ts
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll } from "vitest";
import { buildApp } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import { idOf } from "../helpers/session.js";

describe("dev routes", () => {
  let on: FastifyInstance;
  let off: FastifyInstance;
  beforeAll(async () => {
    on = await buildApp({ devLoginAs: true });
    off = await buildApp({ devLoginAs: false });
    await Promise.all([on.ready(), off.ready()]);
  });
  afterAll(async () => {
    await Promise.all([on.close(), off.close()]);
    await prisma.$disconnect();
  });

  const loginAs = (app: FastifyInstance, userId: string, csrf = true) =>
    app.inject({
      method: "POST",
      url: "/api/v1/dev/login-as",
      headers: csrf ? { "x-requested-with": "XMLHttpRequest" } : {},
      payload: { userId },
    });

  it("does not exist unless enabled", () => {
    expect(off.hasRoute({ method: "POST", url: "/api/v1/dev/login-as" })).toBe(false);
    expect(on.hasRoute({ method: "POST", url: "/api/v1/dev/login-as" })).toBe(true);
  });

  it("lists only @test.local accounts", async () => {
    const res = await on.inject({ method: "GET", url: "/api/v1/dev/accounts" });
    const emails: string[] = res.json().items.map((a: { email: string }) => a.email);
    expect(emails).toContain("student@test.local");
    expect(emails.every((e) => e.endsWith("@test.local"))).toBe(true);
  });

  it("switches to a test account and /auth/me returns its permissions", async () => {
    const res = await loginAs(on, await idOf(prisma, "teacher@test.local"));
    expect(res.statusCode).toBe(200);
    const cookie = `labsync_session=${res.cookies.find((c) => c.name === "labsync_session")!.value}`;
    const me = await on.inject({ method: "GET", url: "/api/v1/auth/me", headers: { cookie } });
    expect(me.json().user.email).toBe("teacher@test.local");
    expect(me.json().user.permissions).toContain("bookings.use");
  });

  it("refuses accounts outside @test.local and requests without the CSRF header", async () => {
    expect((await loginAs(on, await idOf(prisma, "admin@cedt.edu"))).statusCode).toBe(403);
    expect((await loginAs(on, await idOf(prisma, "student@test.local"), false)).statusCode).toBe(403);
  });
});
```

```bash
npm run test:fresh -- test/core/dev-login.test.ts
```

Expected: test ของ route FAIL

- [ ] **Step 2: `src/modules/dev/routes.ts`**

```ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../../config.js";
import { loadSessionUser } from "../../core/permissions.js";
import { prisma } from "../../db.js";
import { forbidden } from "../../lib/errors.js";
import { hashToken, startSession } from "../../plugins/auth.js";

const TEST_DOMAIN = "@test.local";

/** Dev/demo only (shared plan 2.11). Registered only when devLoginEnabled; never in production. */
export async function devRoutes(app: FastifyInstance): Promise<void> {
  app.get("/dev/accounts", { config: { auth: "public" } }, async () => {
    const users = await prisma.user.findMany({
      where: { email: { endsWith: TEST_DOMAIN }, isActive: true },
      include: { roles: { include: { role: { select: { name: true } } } } },
      orderBy: { email: "asc" },
    });
    return {
      items: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        isStudent: u.studentNo !== null,
        roles: u.roles.map((a) => a.role.name),
      })),
    };
  });

  app.post("/dev/login-as", { config: { auth: "public" } }, async (req, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive || !user.email.toLowerCase().endsWith(TEST_DOMAIN)) {
      throw forbidden("สลับได้เฉพาะบัญชีทดสอบ (@test.local)");
    }
    const raw = req.cookies[config.SESSION_COOKIE_NAME];
    if (raw) await prisma.session.deleteMany({ where: { tokenHash: hashToken(raw) } });
    await startSession(reply, user.id);
    return { user: await loadSessionUser(user.id) };
  });
}
```

- [ ] **Step 3: `src/modules/dev/index.ts` และรายชื่อโมดูล**

```ts
import { devLoginEnabled } from "../../config.js";
import { API_PREFIX, type AppModule } from "../types.js";
import { devRoutes } from "./routes.js";

export const devModule: AppModule = {
  name: "dev",
  async setup(app, opts) {
    if (!(opts.devLoginAs ?? devLoginEnabled)) return;
    app.log.warn("DEV_LOGIN_AS is on: anyone can switch to a @test.local account");
    await app.register(devRoutes, { prefix: API_PREFIX });
  },
};
```

ใน `src/modules/index.ts` import และต่อท้าย `modules` ด้วย `devModule`

ใน `test/modules.test.ts` ให้ `SAMPLE_ROUTES` รับ `null` สำหรับโมดูลที่ลงทะเบียน route แบบมีเงื่อนไข

```ts
const SAMPLE_ROUTES: Record<string, [HTTPMethods, string] | null> = {
  // ...existing entries...
  dev: null, // only with DEV_LOGIN_AS (see test/core/dev-login.test.ts)
};
```

และในลูปของ test "registers each module's routes" ข้ามค่า `null`

```ts
    for (const [name, route] of Object.entries(SAMPLE_ROUTES)) {
      if (!route) continue;
      const [method, url] = route;
      expect(app.hasRoute({ method, url }), `${name}: ${method} ${url}`).toBe(true);
    }
```

- [ ] **Step 4: รันและ commit**

```bash
npx tsc --noEmit
npm run test:fresh
git add src test
git commit -m "feat(dev): add /dev/accounts and /dev/login-as behind DEV_LOGIN_AS"
```

Expected: ผ่านทั้งหมดยกเว้น BR-14

---

### Task C4: แถบ DEV ฝั่ง frontend

**Files:**
- Create: `prototype-1/frontend/src/app/devSwitcher.ts`, `src/app/devSwitcher.test.ts`, `src/app/DevUserSwitcher.tsx`
- Modify: `prototype-1/frontend/src/main.tsx`, `prototype-1/frontend/.env.example`

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

`src/app/devSwitcher.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { accountLabel, devSwitcherEnabled } from "./devSwitcher";

describe("devSwitcherEnabled", () => {
  it("shows in dev, or in a demo build with VITE_DEV_LOGIN_AS=true", () => {
    expect(devSwitcherEnabled({ DEV: true })).toBe(true);
    expect(devSwitcherEnabled({ DEV: false, VITE_DEV_LOGIN_AS: "true" })).toBe(true);
    expect(devSwitcherEnabled({ DEV: false })).toBe(false);
  });
});

describe("accountLabel", () => {
  it("names the roles, or นิสิต / ไม่มีบทบาท", () => {
    expect(accountLabel({ name: "A", roles: ["อาจารย์"], isStudent: false })).toBe("A — อาจารย์");
    expect(accountLabel({ name: "B", roles: [], isStudent: true })).toBe("B — นิสิต");
    expect(accountLabel({ name: "C", roles: [], isStudent: false })).toBe("C — ไม่มีบทบาท");
  });
});
```

```bash
cd prototype-1/frontend
npx vitest run src/app/devSwitcher.test.ts
```

Expected: FAIL

- [ ] **Step 2: `src/app/devSwitcher.ts`**

```ts
export interface DevAccount {
  id: string;
  name: string;
  email: string;
  isStudent: boolean;
  roles: string[];
}

/** The DEV bar shows in `vite dev`, or in a demo build with VITE_DEV_LOGIN_AS=true (shared plan 2.11). */
export const devSwitcherEnabled = (env: { DEV: boolean; VITE_DEV_LOGIN_AS?: string }): boolean =>
  env.DEV || env.VITE_DEV_LOGIN_AS === "true";

export const accountLabel = (a: Pick<DevAccount, "name" | "roles" | "isStudent">): string =>
  `${a.name} — ${a.roles.join(", ") || (a.isStudent ? "นิสิต" : "ไม่มีบทบาท")}`;
```

- [ ] **Step 3: `src/app/DevUserSwitcher.tsx`**

```tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useAuth } from "./AuthProvider";
import { accountLabel, devSwitcherEnabled, type DevAccount } from "./devSwitcher";

const enabled = devSwitcherEnabled({ DEV: import.meta.env.DEV, VITE_DEV_LOGIN_AS: import.meta.env.VITE_DEV_LOGIN_AS });

async function switchTo(userId: string): Promise<void> {
  await api("/dev/login-as", { method: "POST", body: JSON.stringify({ userId }) });
  // Full reload, like signOut(): drops every cached query of the previous account at once.
  window.location.replace("/");
}

/** Corner "DEV" bar: pick a @test.local account to sign in as. Hidden when the API has it off (404). */
export function DevUserSwitcher() {
  const { user } = useAuth();
  const accounts = useQuery({
    queryKey: ["dev", "accounts"],
    queryFn: () => api<{ items: DevAccount[] }>("/dev/accounts"),
    enabled,
    retry: false,
    staleTime: Infinity,
  });
  if (!enabled || !accounts.data) return null;

  return (
    <div className="fixed bottom-3 right-3 z-50 flex items-center gap-2 rounded-md border bg-white/95 px-2 py-1 text-xs shadow">
      <span className="rounded bg-amber-500 px-1.5 font-bold text-white">DEV</span>
      <select
        aria-label="สลับบัญชีทดสอบ"
        className="max-w-64 bg-transparent"
        value={user?.id ?? ""}
        onChange={(e) => void switchTo(e.target.value)}
      >
        <option value="" disabled>
          เลือกบัญชีทดสอบ
        </option>
        {accounts.data.items.map((a) => (
          <option key={a.id} value={a.id}>
            {accountLabel(a)}
          </option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 4: วางใน `src/main.tsx` และ env**

ใน `main.tsx` ใต้ `<AppRoutes />` (ภายใน `<AuthProvider>`) เพิ่ม `<DevUserSwitcher />` และ import จาก `./app/DevUserSwitcher`

`prototype-1/frontend/.env.example` เพิ่ม

```
# Demo builds only: show the DEV account switcher (the API must also set DEV_LOGIN_AS=true).
VITE_DEV_LOGIN_AS=false
```

- [ ] **Step 5: ตรวจและ commit**

```bash
npx vitest run src/app/devSwitcher.test.ts
npm run typecheck
npm test
npm run build
git add src .env.example
git commit -m "feat(web): add the DEV account switcher"
```

Expected: ผ่านทั้งหมด

---

### Task C5: ตรวจรอบสุดท้ายของส่วน C

- [ ] **Step 1: test ทั้งหมด**

```bash
cd prototype-1/backend && npm run test:fresh && npx tsc --noEmit
cd ../frontend && npm run typecheck && npm test && npm run build
```

- [ ] **Step 2: ลองในเบราว์เซอร์**

ตั้ง `DEV_LOGIN_AS=true` ใน `.env` ของ backend (ห้าม commit) เปิด backend และ frontend
- มุมขวาล่างมีแถบ DEV เลือก `อาจารย์ ทดสอบ` หน้าโหลดใหม่ เมนูเปลี่ยนตามสิทธิ์ของอาจารย์
- เลือก `นิสิต ทดสอบ` เข้า `/course-change` ได้ `/admin` ขึ้น "ไม่มีสิทธิ์เข้าถึง"
- ปิด `DEV_LOGIN_AS` แล้ว restart backend แถบหายไป (API ตอบ 404)
- ลอง start backend ด้วย `NODE_ENV=production DEV_LOGIN_AS=true` แอปไม่ขึ้นพร้อมข้อความ `DEV_LOGIN_AS must not be set in production`

- [ ] **Step 3: PR (เมื่อได้รับอนุญาต)**

"Dev account switcher (shared plan step 5c)" base `main` label `shared` แจ้งเจ้าของ storage ว่าลบ `DevStudentSwitcher` ได้ ท้าย body `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
