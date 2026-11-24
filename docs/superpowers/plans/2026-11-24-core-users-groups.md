# Core Users & Groups (ขั้นที่ 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ปรับ `users` ให้รองรับบัญชีที่ไม่มีรหัสผ่านและรหัสนิสิต 10 หลัก ทำ `enrollments` เป็นของกลาง เพิ่ม `groups` และ `group_members` พร้อมบริการ `findUserByStudentNo()`, `groupsOfStudent()` และ endpoint นำเข้ากลุ่มด้วย CSV

**Architecture:** schema อยู่ใน `prisma/schema/core.prisma` สร้าง migration สองตัว (ผู้ใช้กับการลงทะเบียน แล้วกลุ่ม) โดยสร้าง SQL จาก `prisma migrate diff` แล้วเติม CHECK ด้วยมือ บริการของกลางอยู่ใน `src/core/` (รับ `db` ที่เป็น `Tx` เพื่อใช้ใน transaction ของโมดูลได้) ส่วน route `POST /api/v1/import/groups` อยู่ในโมดูล `import` เดิมและเรียกบริการ `importGroups()`

**Tech Stack:** Fastify 5, Prisma 6.19.3 (multi-file schema), PostgreSQL 17, zod 4, Vitest 5, csv-parse

**อ้างอิง:** [แผนของกลาง](2026-11-23-shared-backend-objects.md) หัวข้อ 2.1, 2.3, 3.2 ถึง 3.4 และขั้นที่ 2 ในหัวข้อ 4

---

## ก่อนเริ่ม

- **ฐานของ branch:** PR #11 (`core/restructure`) ยังไม่ merge แผนนี้จึงแตก branch จาก `core/restructure` และเปิด PR โดยตั้ง base เป็น `core/restructure` (stacked PR) เมื่อ #11 merge แล้ว GitHub จะย้าย base เป็น `main` เอง (ถ้าลบ branch `core/restructure` ตอน merge) ถ้า #11 แก้ตาม review ให้ rebase branch นี้ตาม
- **การรัน test:** `npm run test:fresh` (สร้างฐานข้อมูลใช้ครั้งเดียว migrate, seed, รัน แล้วลบ) รันไฟล์เดียวได้ด้วย `npm run test:fresh -- test/core/users.test.ts` ห้ามใช้ `npm run db:reset` หรือ `prisma migrate reset`
- **test ที่ fail อยู่แล้ว:** booking-flow BR-14 fail เพราะวันที่ใน seed (booking เป็นฟีเจอร์เก่าที่ไม่ได้ใช้) ไม่ต้องแก้ ส่วนที่เหลือต้องผ่านทั้งหมด
- **ไม่อยู่ในขอบเขต:**
  - ล็อกอินผ่าน MCV และ `studentNoFromMcv()` (ตัดออกจากลำดับงานแล้ว) ขั้นนี้แค่เพิ่มคอลัมน์ `mcv_id` และให้ `password_hash` ว่างได้
  - ลบ `users.role` และเพิ่ม `isStudent` / `permissions` ใน `SessionUser` (ขั้นที่ 5a) route ใหม่ใช้ `auth: "admin"` ไปก่อน
  - หน้า UI นำเข้ากลุ่ม และ seed กลุ่มตัวอย่าง
- **ต่างจากร่าง schema ในแผนของกลาง (ตัดสินในแผนนี้):**
  - `users.student_no` มี CHECK ตัวเลข 10 หลักเหมือน `group_members` เพราะ `Char(10)` เติมช่องว่างให้ค่าที่สั้นกว่า แล้วการจับคู่กับ `group_members` จะพลาดแบบเงียบ
  - `groups.created_by` มี FK ไป `users` (`onDelete: Restrict`) ตามหัวข้อ 2.1
  - `groupsOfStudent(studentNo, termId)` คืนกลุ่มของเทอมนั้น **และ** กลุ่มที่ไม่ผูกเทอม (เช่น ชมรม)
  - นำเข้า CSV แบบเพิ่มอย่างเดียว: สร้างกลุ่มและสมาชิกใหม่ ตั้ง role ของสมาชิกเดิม ไม่ลบสมาชิกที่ไม่อยู่ในไฟล์
  - Postgres ถือว่า NULL ไม่ซ้ำกันใน unique index ดังนั้น `@@unique([termId, courseId, section, name])` ไม่กันกลุ่มซ้ำที่ไม่มีเทอม การนำเข้าจึงหากลุ่มเดิมด้วย `findFirst` ก่อนสร้างเสมอ

## โครงไฟล์

```
prototype-1/backend/
  prisma/schema/core.prisma                       ← แก้ User, Enrollment; เพิ่ม GroupType, GroupMemberRole, Group, GroupMember
  prisma/schema/migrations/
    20261124120000_core_users_enrollments/        ← ใหม่
    20261124130000_core_groups/                   ← ใหม่
  src/core/users.ts                               ← ใหม่: isStudentNo(), findUserByStudentNo()
  src/core/groups.ts                              ← ใหม่: groupsOfStudent()
  src/core/group-import.ts                        ← ใหม่: importGroups()
  src/modules/auth/routes.ts                      ← รองรับ password_hash ว่าง
  src/modules/import/routes.ts                    ← เพิ่ม POST /import/groups
  test/core/users.test.ts                         ← ใหม่
  test/core/groups.test.ts                        ← ใหม่
  test/core/group-import.test.ts                  ← ใหม่
```

---

### Task 1: สร้าง branch และวัดค่าตั้งต้น

**Files:** ไม่มี

- [ ] **Step 1: แตก branch จาก `core/restructure`**

```bash
git fetch origin
git switch -c core/users-groups origin/core/restructure
```

ถ้าทำใน worktree ใหม่ ให้คัดลอก `prototype-1/backend/.env` มาจากที่เดิม (ห้ามพิมพ์เนื้อหาไฟล์ออกจอ)

- [ ] **Step 2: ติดตั้งและ generate client**

```bash
cd prototype-1/backend
npm ci
npx prisma generate
```

Expected: `Generated Prisma Client`

- [ ] **Step 3: รัน test และ typecheck ตั้งต้น**

```bash
npm run test:fresh
npx tsc --noEmit
```

Expected: `Tests  1 failed | 283 passed (284)` (ตัวที่ fail คือ BR-14) และ `tsc` ไม่มี error

- [ ] **Step 4: เก็บสำเนา schema ของขั้นที่ 1 ไว้นอก repo**

ใช้เป็นจุดเริ่มของ `migrate diff` ใน Task 2 และ 3

```bash
rm -rf "${TMPDIR:-/tmp}/schema-step1"
mkdir -p "${TMPDIR:-/tmp}/schema-step1"
cp prisma/schema/*.prisma "${TMPDIR:-/tmp}/schema-step1/"
```

---

### Task 2: `users` และ `enrollments`

**Files:**
- Modify: `prototype-1/backend/prisma/schema/core.prisma` (model `User`, `Enrollment`)
- Create: `prototype-1/backend/prisma/schema/migrations/20261124120000_core_users_enrollments/migration.sql`
- Modify: `prototype-1/backend/src/modules/auth/routes.ts:42,107`
- Test: `prototype-1/backend/test/core/users.test.ts` (ส่วนฐานข้อมูลและล็อกอิน)

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

`test/core/users.test.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { prisma } from "../../src/db.js";

const NO_PASSWORD_EMAIL = "core-users-nopass@test.local";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: NO_PASSWORD_EMAIL } });
  await app.close();
  await prisma.$disconnect();
});

describe("users table", () => {
  it("accepts an account without a password (MCV sign-in)", async () => {
    const user = await prisma.user.create({
      data: { email: NO_PASSWORD_EMAIL, name: "No Password", role: "student", studentNo: "6699999990", mcvId: "mcv-test-1" },
    });
    expect(user.passwordHash).toBeNull();
    expect(user.mcvId).toBe("mcv-test-1");
  });

  it("rejects a student number that is not 10 digits", async () => {
    const student = await prisma.user.findUniqueOrThrow({ where: { email: "student@cedt.edu" } });
    await expect(
      prisma.user.update({ where: { id: student.id }, data: { studentNo: "12345" } }),
    ).rejects.toThrow();
    await expect(
      prisma.user.update({ where: { id: student.id }, data: { studentNo: "66300001210" } }),
    ).rejects.toThrow();
  });

  it("returns 401 when an account without a password tries to log in", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { "x-requested-with": "XMLHttpRequest" },
      payload: { email: NO_PASSWORD_EMAIL, password: "anything" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.message).toBe("Invalid email or password");
  });
});
```

body ของ error มาจาก `src/plugins/errors.ts` เป็น `{ error: { code, message, details } }`

- [ ] **Step 2: รัน test ให้เห็นว่าไม่ผ่าน**

```bash
npm run test:fresh -- test/core/users.test.ts
```

Expected: FAIL (`mcvId` ไม่มีใน type และ `passwordHash` บังคับ)

- [ ] **Step 3: แก้ model `User`**

ใน `prisma/schema/core.prisma` แก้เฉพาะบรรทัดเหล่านี้ใน `model User` (คอลัมน์และ relation อื่นคงเดิม รวม `role` และ `lineUserId`)

```prisma
  /// Null for accounts that sign in through MCV.
  passwordHash     String?   @map("password_hash")
  /// This person's id in MCV (set on first MCV sign-in).
  mcvId            String?   @unique @map("mcv_id")
  /// Set = this user is a student. Exactly 10 digits (CHECK users_student_no_format).
  studentNo        String?   @unique @map("student_no") @db.Char(10)
```

และ relation ของ advisor

```prisma
  advisor                      User?                        @relation("advisor", fields: [advisorId], references: [id], onDelete: Restrict)
```

- [ ] **Step 4: แก้ model `Enrollment`**

แทน `model Enrollment` ทั้งก้อนด้วย

```prisma
/// A student's registration in a course (mirrors Reg Chula; seeded in the prototype). Shared table.
model Enrollment {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  studentId String   @map("student_id") @db.Uuid
  termId    String   @map("term_id") @db.Uuid
  courseId  String   @map("course_id") @db.Uuid
  /// Null when unknown — demo data never invents official sections or credits.
  section   String?
  credits   Int?     @db.SmallInt
  /// Provenance, e.g. "synthetic-demo". A future Reg Chula sync would write its own value.
  source    String?
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  student User   @relation(fields: [studentId], references: [id], onDelete: Restrict)
  term    Term   @relation(fields: [termId], references: [id], onDelete: Restrict)
  course  Course @relation(fields: [courseId], references: [id], onDelete: Restrict)

  @@unique([studentId, termId, courseId])
  @@index([termId, courseId, section])
  @@map("enrollments")
}
```

ก่อนแก้ FK ของ term ตรวจว่าไม่มีโค้ดลบเทอม:

```bash
grep -rn "term.delete\|term.deleteMany" src scripts prisma test
```

Expected: ไม่มีผลลัพธ์

- [ ] **Step 5: สร้าง SQL ของ migration**

```bash
npx prisma format
mkdir -p prisma/schema/migrations/20261124120000_core_users_enrollments
npx prisma migrate diff --from-schema-datamodel "${TMPDIR:-/tmp}/schema-step1" --to-schema-datamodel prisma/schema --script > prisma/schema/migrations/20261124120000_core_users_enrollments/migration.sql
```

- [ ] **Step 6: แก้ SQL ด้วยมือ**

Prisma สร้าง `updated_at` แบบ `NOT NULL` ไม่มีค่าเริ่มต้น ซึ่งจะล้มบนตารางที่มีแถวอยู่แล้ว และเขียน CHECK เองไม่ได้ เปิดไฟล์แล้วให้เนื้อหาเป็นแบบนี้ (ลำดับคำสั่งที่ Prisma สร้างอาจต่างได้ แต่ต้องครบทุกข้อ):

```sql
-- users: accounts without a password (MCV), MCV id, 10-digit student numbers.
ALTER TABLE "users" DROP CONSTRAINT "users_advisor_id_fkey";
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN "mcv_id" TEXT;
-- Fails loudly if an existing student number is longer than 10 characters.
ALTER TABLE "users" ALTER COLUMN "student_no" SET DATA TYPE CHAR(10);
-- Hand-written: Prisma cannot express CHECK constraints. Also rejects shorter values, which CHAR(10) pads.
ALTER TABLE "users" ADD CONSTRAINT "users_student_no_format" CHECK ("student_no" ~ '^[0-9]{10}$');
CREATE UNIQUE INDEX "users_mcv_id_key" ON "users"("mcv_id");
ALTER TABLE "users" ADD CONSTRAINT "users_advisor_id_fkey" FOREIGN KEY ("advisor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- enrollments: shared table; deleting a term must not silently delete enrollments.
ALTER TABLE "enrollments" DROP CONSTRAINT "enrollments_term_id_fkey";
-- Hand-edited: existing rows need a value, then the default goes (Prisma's @updatedAt has none).
ALTER TABLE "enrollments" ADD COLUMN "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "enrollments" ALTER COLUMN "updated_at" DROP DEFAULT;
CREATE INDEX "enrollments_term_id_course_id_section_idx" ON "enrollments"("term_id", "course_id", "section");
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

ถ้า Prisma สร้างคำสั่งที่ไม่อยู่ในรายการนี้ (เช่น แตะตารางอื่น) ให้หยุดและหาสาเหตุ แปลว่า schema ต่างจากที่ตั้งใจ

- [ ] **Step 7: ลอง migration กับฐานข้อมูล dev ที่มีข้อมูล seed**

```bash
npx prisma migrate deploy
npx prisma migrate diff --from-schema-datasource prisma/schema --to-schema-datamodel prisma/schema --exit-code
```

Expected: `deploy` สำเร็จ (ยืนยันว่ารหัสนิสิตใน seed ผ่าน `CHAR(10)` และ CHECK) และ `migrate diff` ได้ `No difference detected.` exit code 0 (ถ้าได้ 2 แปลว่า SQL ไม่ตรงกับ schema)

- [ ] **Step 8: แก้ auth ให้รองรับ `password_hash` ว่าง**

`npx prisma generate` แล้ว `npx tsc --noEmit` จะ error ที่ `src/modules/auth/routes.ts` สองที่ แก้ดังนี้

ใน `/auth/login` ก่อน `const ok = await argon2.verify(user.passwordHash, password);`

```ts
    // MCV accounts have no password. Same generic 401, and no lockout counting (§6.1).
    if (!user.passwordHash) throw unauthenticated("Invalid email or password");

    const ok = await argon2.verify(user.passwordHash, password);
```

ใน `/users/me/password` แทนเงื่อนไขเดิม

```ts
    if (!user.passwordHash || !(await argon2.verify(user.passwordHash, currentPassword))) {
      throw unauthenticated("Current password is incorrect");
    }
```

- [ ] **Step 9: รัน test**

```bash
npx tsc --noEmit
npm run test:fresh
```

Expected: `tsc` ไม่มี error และ test ผ่านทั้งหมดยกเว้น BR-14 (รวม 3 test ใหม่)

- [ ] **Step 10: Commit**

```bash
git add prisma/schema src/modules/auth/routes.ts test/core/users.test.ts
git commit -m "feat(core): allow password-less users, 10-digit student numbers, shared enrollments"
```

---

### Task 3: `groups` และ `group_members`

**Files:**
- Modify: `prototype-1/backend/prisma/schema/core.prisma`
- Create: `prototype-1/backend/prisma/schema/migrations/20261124130000_core_groups/migration.sql`
- Test: `prototype-1/backend/test/core/groups.test.ts` (ส่วนฐานข้อมูล)

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

`test/core/groups.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/db.js";

const PREFIX = "TEST-CORE-GROUPS";

let termId: string;
let courseId: string;

beforeAll(async () => {
  termId = (await prisma.term.findFirstOrThrow({ where: { isActive: true } })).id;
  courseId = (await prisma.course.findFirstOrThrow({ where: { isActive: true } })).id;
});

afterAll(async () => {
  await prisma.groupMember.deleteMany({ where: { group: { name: { startsWith: PREFIX } } } });
  await prisma.group.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.$disconnect();
});

describe("groups table", () => {
  it("requires course and term for a course_section group", async () => {
    await expect(
      prisma.group.create({ data: { type: "course_section", name: `${PREFIX} no course`, termId } }),
    ).rejects.toThrow();
    const ok = await prisma.group.create({
      data: { type: "course_section", name: `${PREFIX} ok`, termId, courseId, section: "1" },
    });
    expect(ok.isActive).toBe(true);
  });

  it("rejects a member student number that is not 10 digits", async () => {
    const club = await prisma.group.create({ data: { type: "club", name: `${PREFIX} club check` } });
    await expect(
      prisma.groupMember.create({ data: { groupId: club.id, studentNo: "12345" } }),
    ).rejects.toThrow();
    const member = await prisma.groupMember.create({ data: { groupId: club.id, studentNo: "6699999991" } });
    expect(member.role).toBe("member");
  });
});
```

- [ ] **Step 2: รัน test ให้เห็นว่าไม่ผ่าน**

```bash
npm run test:fresh -- test/core/groups.test.ts
```

Expected: FAIL (`prisma.group` ไม่มี)

- [ ] **Step 3: เพิ่ม model ใน `core.prisma`**

ต่อท้ายไฟล์

```prisma
enum GroupType {
  /// A group inside a course, e.g. "Group 09". Needs course and term (CHECK groups_course_section_needs_course_term).
  course_section
  club
  project
  personal

  @@map("group_type")
}

enum GroupMemberRole {
  member
  leader

  @@map("group_member_role")
}

/// A set of students. Members are referenced by student number because groups are imported
/// from CSV before the students have accounts.
model Group {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  type        GroupType
  name        String
  courseId    String?   @map("course_id") @db.Uuid
  termId      String?   @map("term_id") @db.Uuid
  section     String?
  /// Null when the group came from a CSV import.
  createdById String?   @map("created_by") @db.Uuid
  isActive    Boolean   @default(true) @map("is_active")
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  course    Course?       @relation(fields: [courseId], references: [id], onDelete: Restrict)
  term      Term?         @relation(fields: [termId], references: [id], onDelete: Restrict)
  createdBy User?         @relation("groupsCreated", fields: [createdById], references: [id], onDelete: Restrict)
  members   GroupMember[]

  /// NULLs are distinct in Postgres, so this does not stop duplicate groups without a term or
  /// course; importGroups() looks a group up with findFirst before creating it.
  @@unique([termId, courseId, section, name])
  @@index([type, isActive])
  @@map("groups")
}

model GroupMember {
  groupId   String          @map("group_id") @db.Uuid
  /// 10 digits (CHECK group_members_student_no_format). No FK: matched to users.student_no on read.
  studentNo String          @map("student_no") @db.Char(10)
  role      GroupMemberRole @default(member)
  createdAt DateTime        @default(now()) @map("created_at") @db.Timestamptz(6)

  group Group @relation(fields: [groupId], references: [id], onDelete: Restrict)

  @@id([groupId, studentNo])
  @@index([studentNo])
  @@map("group_members")
}
```

เพิ่ม relation ฝั่งตรงข้าม:
- `model User`: `groupsCreated                Group[]                      @relation("groupsCreated")`
- `model Course`: `groups                       Group[]`
- `model Term`: `groups                       Group[]`

- [ ] **Step 4: สร้าง SQL ของ migration**

```bash
npx prisma format
mkdir -p prisma/schema/migrations/20261124130000_core_groups
npx prisma migrate diff --from-schema-datasource prisma/schema --to-schema-datamodel prisma/schema --script > prisma/schema/migrations/20261124130000_core_groups/migration.sql
```

(ฐานข้อมูล dev ผ่าน migration ของ Task 2 แล้ว จึงใช้เป็นจุดเริ่มได้) ไฟล์ที่ได้ต้องมีเฉพาะ `CREATE TYPE "group_type"`, `CREATE TYPE "group_member_role"`, `CREATE TABLE "groups"`, `CREATE TABLE "group_members"`, index ของสองตารางนี้ และ FK ของ `groups` (course, term, created_by) กับ `group_members` (group) ถ้ามีอย่างอื่นให้หยุดและหาสาเหตุ

- [ ] **Step 5: เติม CHECK ท้ายไฟล์**

```sql
-- Hand-written: Prisma cannot express CHECK constraints.
ALTER TABLE "groups" ADD CONSTRAINT "groups_course_section_needs_course_term"
  CHECK ("type" <> 'course_section' OR ("course_id" IS NOT NULL AND "term_id" IS NOT NULL));
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_student_no_format"
  CHECK ("student_no" ~ '^[0-9]{10}$');
```

- [ ] **Step 6: ใช้ migration และตรวจว่าตรงกับ schema**

```bash
npx prisma migrate deploy
npx prisma migrate diff --from-schema-datasource prisma/schema --to-schema-datamodel prisma/schema --exit-code
npx prisma generate
```

Expected: `No difference detected.` exit code 0

- [ ] **Step 7: รัน test**

```bash
npm run test:fresh -- test/core/groups.test.ts
npx tsc --noEmit
```

Expected: 2 test ผ่าน และ `tsc` ไม่มี error

- [ ] **Step 8: Commit**

```bash
git add prisma/schema test/core/groups.test.ts
git commit -m "feat(core): add groups and group members"
```

---

### Task 4: `findUserByStudentNo()`

**Files:**
- Create: `prototype-1/backend/src/core/users.ts`
- Modify: `prototype-1/backend/test/core/users.test.ts`

- [ ] **Step 1: เพิ่ม test**

เพิ่ม import ด้านบนของ `test/core/users.test.ts`

```ts
import { findUserByStudentNo, isStudentNo } from "../../src/core/users.js";
```

ต่อท้ายไฟล์

```ts
describe("isStudentNo", () => {
  it("accepts exactly 10 digits", () => {
    expect(isStudentNo("6630000121")).toBe(true);
    for (const bad of ["663000012", "66300001210", "66300001AB", "6630 00121", ""]) {
      expect(isStudentNo(bad)).toBe(false);
    }
  });
});

describe("findUserByStudentNo", () => {
  it("returns the account of a student who has signed in", async () => {
    const user = await findUserByStudentNo("6630000121");
    expect(user).toMatchObject({ email: "student@cedt.edu", studentNo: "6630000121" });
  });

  it("returns null for a student without an account", async () => {
    expect(await findUserByStudentNo("6699999999")).toBeNull();
  });

  it("returns null for a malformed number", async () => {
    expect(await findUserByStudentNo("123")).toBeNull();
  });

  it("never returns the password hash", async () => {
    const user = await findUserByStudentNo("6630000121");
    expect(Object.keys(user ?? {})).not.toContain("passwordHash");
  });
});
```

- [ ] **Step 2: รัน test ให้เห็นว่าไม่ผ่าน**

```bash
npm run test:fresh -- test/core/users.test.ts
```

Expected: FAIL เพราะ import `../../src/core/users.js` ไม่เจอ

- [ ] **Step 3: สร้าง `src/core/users.ts`**

```ts
import { prisma, type Tx } from "../db.js";

/** A Chula student number: exactly 10 digits (matches the CHECKs on users and group_members). */
export const isStudentNo = (value: string): boolean => /^\d{10}$/.test(value);

/** Fields of a user that other modules may read. Never includes the password hash. */
const PUBLIC_USER = {
  id: true,
  name: true,
  titlePrefix: true,
  email: true,
  studentNo: true,
  isActive: true,
} as const;

/**
 * The account of the student with this number, or null if they have never signed in (groups
 * and counter loans reference students by number before that). Deactivated accounts are
 * returned too; the caller decides whether they count.
 */
export async function findUserByStudentNo(studentNo: string, db: Tx = prisma) {
  if (!isStudentNo(studentNo)) return null;
  return db.user.findUnique({ where: { studentNo }, select: PUBLIC_USER });
}
```

- [ ] **Step 4: รัน test**

```bash
npm run test:fresh -- test/core/users.test.ts
npx tsc --noEmit
```

Expected: 8 test ผ่าน

- [ ] **Step 5: Commit**

```bash
git add src/core/users.ts test/core/users.test.ts
git commit -m "feat(core): add findUserByStudentNo"
```

---

### Task 5: `groupsOfStudent()`

**Files:**
- Create: `prototype-1/backend/src/core/groups.ts`
- Modify: `prototype-1/backend/test/core/groups.test.ts`

- [ ] **Step 1: เพิ่ม test**

เพิ่ม import ด้านบนของ `test/core/groups.test.ts`

```ts
import type { GroupType } from "@prisma/client";
import { groupsOfStudent } from "../../src/core/groups.js";
```

ต่อท้ายไฟล์

```ts
describe("groupsOfStudent", () => {
  const STUDENT = "6699999992";
  let otherTermId: string;

  beforeAll(async () => {
    const other = await prisma.term.findFirst({ where: { id: { not: termId } } });
    otherTermId =
      other?.id ??
      (await prisma.term.create({
        data: { academicYear: 2099, termNumber: 1, startDate: new Date("2099-01-01"), endDate: new Date("2099-05-31") },
      })).id;

    const make = (data: {
      type: GroupType;
      name: string;
      termId?: string;
      courseId?: string;
      section?: string;
      isActive?: boolean;
    }) => prisma.group.create({ data: { ...data, members: { create: { studentNo: STUDENT, role: "leader" } } } });
    await make({ type: "course_section", name: `${PREFIX} this term`, termId, courseId, section: "9" });
    await make({ type: "club", name: `${PREFIX} no term` });
    await make({ type: "club", name: `${PREFIX} inactive`, isActive: false });
    await make({ type: "project", name: `${PREFIX} other term`, termId: otherTermId });
  });

  afterAll(async () => {
    await prisma.groupMember.deleteMany({ where: { group: { name: { startsWith: PREFIX } } } });
    await prisma.group.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await prisma.term.deleteMany({ where: { academicYear: 2099 } });
  });

  it("returns the active groups of that term and groups without a term", async () => {
    const groups = await groupsOfStudent(STUDENT, termId);
    expect(groups.map((g) => g.name).sort()).toEqual([`${PREFIX} no term`, `${PREFIX} this term`]);
    expect(groups.every((g) => g.role === "leader")).toBe(true);
  });

  it("returns an empty list for a malformed number", async () => {
    expect(await groupsOfStudent("123", termId)).toEqual([]);
  });
});
```

หมายเหตุ: `afterAll` ระดับไฟล์ (จาก Task 3) ลบกลุ่มที่ขึ้นต้นด้วย `PREFIX` ด้วย การลบซ้ำไม่เป็นปัญหา แต่ `afterAll` ใน `describe` ต้องลบกลุ่มก่อนลบเทอม 2099 เพราะ FK เป็น Restrict

- [ ] **Step 2: รัน test ให้เห็นว่าไม่ผ่าน**

```bash
npm run test:fresh -- test/core/groups.test.ts
```

Expected: FAIL เพราะ import `../../src/core/groups.js` ไม่เจอ

- [ ] **Step 3: สร้าง `src/core/groups.ts`**

```ts
import type { GroupMemberRole, GroupType } from "@prisma/client";
import { prisma, type Tx } from "../db.js";
import { isStudentNo } from "./users.js";

export interface StudentGroup {
  id: string;
  type: GroupType;
  name: string;
  courseId: string | null;
  termId: string | null;
  section: string | null;
  /** The student's role in this group. */
  role: GroupMemberRole;
}

/**
 * Active groups the student belongs to in this term, plus active groups that have no term
 * (e.g. clubs). Works before the student has an account: members are stored by number.
 */
export async function groupsOfStudent(studentNo: string, termId: string, db: Tx = prisma): Promise<StudentGroup[]> {
  if (!isStudentNo(studentNo)) return [];
  const rows = await db.groupMember.findMany({
    where: { studentNo, group: { isActive: true, OR: [{ termId }, { termId: null }] } },
    include: { group: true },
    orderBy: { group: { name: "asc" } },
  });
  return rows.map(({ role, group }) => ({
    id: group.id,
    type: group.type,
    name: group.name,
    courseId: group.courseId,
    termId: group.termId,
    section: group.section,
    role,
  }));
}
```

- [ ] **Step 4: รัน test**

```bash
npm run test:fresh -- test/core/groups.test.ts
npx tsc --noEmit
```

Expected: 4 test ผ่าน

- [ ] **Step 5: Commit**

```bash
git add src/core/groups.ts test/core/groups.test.ts
git commit -m "feat(core): add groupsOfStudent"
```

---

### Task 6: บริการนำเข้ากลุ่ม `importGroups()`

**Files:**
- Create: `prototype-1/backend/src/core/group-import.ts`
- Test: `prototype-1/backend/test/core/group-import.test.ts` (ส่วนบริการ)

**รูปแบบ CSV** (หนึ่งแถวต่อสมาชิกหนึ่งคน แถวแรกเป็นหัวคอลัมน์)

| คอลัมน์ | บังคับ | ค่า |
|---|---|---|
| `type` | ใช่ | `course_section`, `club`, `project`, `personal` |
| `name` | ใช่ | ชื่อกลุ่ม เช่น `Group 09` |
| `courseCode` | ถ้า `type = course_section` | รหัสวิชาที่มีใน `courses` |
| `section` | ไม่ | ตอนเรียน |
| `studentNo` | ใช่ | ตัวเลข 10 หลัก |
| `role` | ไม่ (ค่าเริ่มต้น `member`) | `member`, `leader` |

เทอมมาจาก query `termId` และใช้กับทุกแถวในไฟล์ (`course_section` ต้องมี)

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

`test/core/group-import.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importGroups } from "../../src/core/group-import.js";
import { prisma } from "../../src/db.js";

const PREFIX = "TEST-IMPORT";
const HAS_ACCOUNT = "6630000121"; // student@cedt.edu in the seed
const NO_ACCOUNT = "6699999993";

let termId: string;
let courseCode: string;

beforeAll(async () => {
  termId = (await prisma.term.findFirstOrThrow({ where: { isActive: true } })).id;
  courseCode = (await prisma.course.findFirstOrThrow({ where: { isActive: true } })).code;
});

afterAll(async () => {
  await prisma.groupMember.deleteMany({ where: { group: { name: { startsWith: PREFIX } } } });
  await prisma.group.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.$disconnect();
});

const row = (r: Partial<Record<"type" | "name" | "courseCode" | "section" | "studentNo" | "role", string>>) => ({
  type: "course_section",
  name: `${PREFIX} G1`,
  courseCode,
  section: "1",
  studentNo: HAS_ACCOUNT,
  role: "member",
  ...r,
});

const groupCount = () => prisma.group.count({ where: { name: { startsWith: PREFIX } } });

describe("importGroups dry run", () => {
  it("reports every row, flags students without an account, and writes nothing", async () => {
    const result = await importGroups(
      [row({ role: "leader" }), row({ studentNo: NO_ACCOUNT })],
      { termId, dryRun: true },
    );
    expect(result.dryRun).toBe(true);
    expect(result.summary).toEqual({ create: 2, update: 0, error: 0, noAccount: 1 });
    expect(result.rows.map((r) => r.hasAccount)).toEqual([true, false]);
    expect(await groupCount()).toBe(0);
  });

  it("reports invalid rows with their line numbers", async () => {
    const result = await importGroups(
      [
        row({ type: "team" }),
        row({ name: "" }),
        row({ studentNo: "12345" }),
        row({ role: "owner" }),
        row({ courseCode: "NO-SUCH-COURSE" }),
        row({}),
        row({}),
      ],
      { termId, dryRun: true },
    );
    expect(result.rows.filter((r) => r.action === "error").map((r) => r.row)).toEqual([2, 3, 4, 5, 6, 8]);
    expect(result.rows[5]).toMatchObject({ row: 7, action: "create" });
  });

  it("rejects a course_section row when no term is given", async () => {
    const result = await importGroups([row({})], { termId: null, dryRun: true });
    expect(result.rows[0]).toMatchObject({ action: "error" });
  });
});

describe("importGroups apply", () => {
  it("fails the whole file on any error and writes nothing", async () => {
    await expect(
      importGroups([row({}), row({ studentNo: "bad" })], { termId, dryRun: false }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await groupCount()).toBe(0);
  });

  it("creates groups and members, including students without an account", async () => {
    const result = await importGroups(
      [
        row({ role: "leader" }),
        row({ studentNo: NO_ACCOUNT }),
        row({ type: "club", name: `${PREFIX} Club`, courseCode: "", section: "" }),
      ],
      { termId, dryRun: false },
    );
    expect(result.summary).toMatchObject({ create: 3, error: 0, noAccount: 1 });
    const g1 = await prisma.group.findFirstOrThrow({ where: { name: `${PREFIX} G1` }, include: { members: true } });
    expect(g1.members.map((m) => [m.studentNo, m.role]).sort()).toEqual([
      [HAS_ACCOUNT, "leader"],
      [NO_ACCOUNT, "member"],
    ]);
  });

  it("re-importing updates roles without duplicating groups (also groups without a course)", async () => {
    const result = await importGroups(
      [
        row({ role: "member" }),
        row({ type: "club", name: `${PREFIX} Club`, courseCode: "", section: "", role: "leader" }),
      ],
      { termId, dryRun: false },
    );
    expect(result.summary).toMatchObject({ create: 0, update: 2 });
    expect(await groupCount()).toBe(2);
    const member = await prisma.groupMember.findFirstOrThrow({
      where: { studentNo: HAS_ACCOUNT, group: { name: `${PREFIX} G1` } },
    });
    expect(member.role).toBe("member");
  });
});
```

`termId` ใช้กับทุกแถวในไฟล์ กลุ่ม club ในเทสต์จึงได้ `termId` ด้วย และ re-import ในเทสต์ถัดไปหากลุ่มเดิมเจอด้วยคีย์เดียวกัน

ลำดับแถวใน test "reports invalid rows": แถว 2 type ผิด, 3 ไม่มีชื่อ, 4 รหัสนิสิตผิด, 5 role ผิด, 6 วิชาไม่มี, 7 ถูกต้อง, 8 ซ้ำกับแถว 7

- [ ] **Step 2: รัน test ให้เห็นว่าไม่ผ่าน**

```bash
npm run test:fresh -- test/core/group-import.test.ts
```

Expected: FAIL เพราะ import `../../src/core/group-import.js` ไม่เจอ

- [ ] **Step 3: สร้าง `src/core/group-import.ts`**

```ts
import { GroupMemberRole, GroupType, type PrismaClient } from "@prisma/client";
import { prisma, type Tx } from "../db.js";
import { validation } from "../lib/errors.js";
import { findUserByStudentNo, isStudentNo } from "./users.js";

export interface GroupImportRow {
  /** Line in the CSV file (the header is line 1). */
  row: number;
  action: "create" | "update" | "error";
  message: string;
  /** False when the student has never signed in. Their membership is still imported. */
  hasAccount?: boolean;
}

export interface GroupImportResult {
  dryRun: boolean;
  summary: { create: number; update: number; error: number; noAccount: number };
  rows: GroupImportRow[];
}

interface GroupKey {
  type: GroupType;
  name: string;
  courseId: string | null;
  termId: string | null;
  section: string | null;
}

interface PlannedMember {
  group: GroupKey;
  studentNo: string;
  role: GroupMemberRole;
}

const GROUP_TYPES: string[] = Object.values(GroupType);
const MEMBER_ROLES: string[] = Object.values(GroupMemberRole);

const keyOf = (g: GroupKey): string => JSON.stringify([g.termId, g.courseId, g.section, g.name]);

/** findFirst, not findUnique: the unique index treats NULL term/course/section as distinct. */
const findGroup = (db: Tx, g: GroupKey) =>
  db.group.findFirst({ where: { termId: g.termId, courseId: g.courseId, section: g.section, name: g.name } });

/**
 * Imports group members from parsed CSV records (one member per row). Additive: creates groups
 * and memberships and sets the role of existing members; never removes anyone. Any error row
 * fails the whole file (all-or-nothing, like the other imports). Row messages never contain
 * student numbers.
 */
export async function importGroups(
  records: Record<string, string>[],
  opts: { termId: string | null; dryRun: boolean },
  db: PrismaClient = prisma,
): Promise<GroupImportResult> {
  const rows: GroupImportRow[] = [];
  const planned: PlannedMember[] = [];
  const seen = new Set<string>();
  const courseIds = new Map<string, string | null>();

  for (const [i, rec] of records.entries()) {
    const row = i + 2;
    const fail = (message: string) => rows.push({ row, action: "error", message });
    const type = rec.type?.trim() ?? "";
    const name = rec.name?.trim() ?? "";
    const courseCode = rec.courseCode?.trim() || null;
    const section = rec.section?.trim() || null;
    const studentNo = rec.studentNo?.trim() ?? "";
    const role = rec.role?.trim() || "member";

    if (!GROUP_TYPES.includes(type)) { fail(`type '${type}' must be ${GROUP_TYPES.join("|")}`); continue; }
    if (!name) { fail("name is required"); continue; }
    if (!isStudentNo(studentNo)) { fail("studentNo must be exactly 10 digits"); continue; }
    if (!MEMBER_ROLES.includes(role)) { fail(`role '${role}' must be ${MEMBER_ROLES.join("|")}`); continue; }
    if (type === "course_section" && (!courseCode || !opts.termId)) {
      fail("course_section groups need courseCode and the termId query parameter");
      continue;
    }

    let courseId: string | null = null;
    if (courseCode) {
      if (!courseIds.has(courseCode)) {
        const course = await db.course.findUnique({ where: { code: courseCode }, select: { id: true } });
        courseIds.set(courseCode, course?.id ?? null);
      }
      courseId = courseIds.get(courseCode) ?? null;
      if (!courseId) { fail(`courseCode '${courseCode}' matches no course`); continue; }
    }

    const group: GroupKey = { type: type as GroupType, name, courseId, termId: opts.termId, section };
    const memberKey = `${keyOf(group)}|${studentNo}`;
    if (seen.has(memberKey)) { fail("this student is listed twice for the same group"); continue; }
    seen.add(memberKey);

    const existingGroup = await findGroup(db, group);
    if (existingGroup && existingGroup.type !== group.type) {
      fail(`group '${name}' already exists with type ${existingGroup.type}`);
      continue;
    }
    const existingMember = existingGroup
      ? await db.groupMember.findUnique({ where: { groupId_studentNo: { groupId: existingGroup.id, studentNo } } })
      : null;
    const hasAccount = (await findUserByStudentNo(studentNo, db)) !== null;

    rows.push({
      row,
      action: existingMember ? "update" : "create",
      message: existingMember
        ? `already in '${name}' — role will be set to ${role}`
        : existingGroup
          ? `will be added to '${name}'`
          : `'${name}' will be created with this member`,
      hasAccount,
    });
    planned.push({ group, studentNo, role: role as GroupMemberRole });
  }

  const summary = {
    create: rows.filter((r) => r.action === "create").length,
    update: rows.filter((r) => r.action === "update").length,
    error: rows.filter((r) => r.action === "error").length,
    noAccount: rows.filter((r) => r.hasAccount === false).length,
  };

  if (opts.dryRun) return { dryRun: true, summary, rows };
  if (summary.error > 0) {
    throw validation("Import failed — fix the reported rows and try again", rows);
  }

  await db.$transaction(async (tx) => {
    const groupIds = new Map<string, string>();
    for (const m of planned) {
      const key = keyOf(m.group);
      let groupId = groupIds.get(key);
      if (!groupId) {
        groupId = (await findGroup(tx, m.group))?.id ?? (await tx.group.create({ data: m.group })).id;
        groupIds.set(key, groupId);
      }
      await tx.groupMember.upsert({
        where: { groupId_studentNo: { groupId, studentNo: m.studentNo } },
        create: { groupId, studentNo: m.studentNo, role: m.role },
        update: { role: m.role },
      });
    }
  });

  return { dryRun: false, summary, rows };
}
```

- [ ] **Step 4: รัน test**

```bash
npm run test:fresh -- test/core/group-import.test.ts
npx tsc --noEmit
```

Expected: 6 test ผ่าน

- [ ] **Step 5: Commit**

```bash
git add src/core/group-import.ts test/core/group-import.test.ts
git commit -m "feat(core): add importGroups for CSV group membership"
```

---

### Task 7: route `POST /api/v1/import/groups`

**Files:**
- Modify: `prototype-1/backend/src/modules/import/routes.ts`
- Modify: `prototype-1/backend/test/core/group-import.test.ts`

- [ ] **Step 1: เพิ่ม test ของ route**

เพิ่ม import ด้านบนของ `test/core/group-import.test.ts`

```ts
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
```

ต่อท้ายไฟล์

```ts
describe("POST /api/v1/import/groups", () => {
  let app: FastifyInstance;
  let staff: string;
  let student: string;

  const login = async (email: string, password: string) => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { "x-requested-with": "XMLHttpRequest" },
      payload: { email, password },
    });
    expect(res.statusCode).toBe(200);
    return `labsync_session=${res.cookies.find((c) => c.name === "labsync_session")!.value}`;
  };

  const upload = (cookie: string, query: string, csv: string, csrf = true) => {
    const boundary = "group-import-boundary";
    return app.inject({
      method: "POST",
      url: `/api/v1/import/groups?${query}`,
      headers: {
        cookie,
        "content-type": `multipart/form-data; boundary=${boundary}`,
        ...(csrf ? { "x-requested-with": "XMLHttpRequest" } : {}),
      },
      payload: Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="groups.csv"\r\n` +
          `Content-Type: text/csv\r\n\r\n${csv}\r\n--${boundary}--\r\n`,
      ),
    });
  };

  const csv = () =>
    `type,name,courseCode,section,studentNo,role\n` +
    `course_section,${PREFIX} Route,${courseCode},2,${NO_ACCOUNT},leader\n`;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    staff = await login("admin@cedt.edu", "admin1234");
    student = await login("student@cedt.edu", "student1234");
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns the dry-run report to staff", async () => {
    const res = await upload(staff, `termId=${termId}&dryRun=true`, csv());
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ dryRun: true, summary: { create: 1, noAccount: 1 } });
    expect(await prisma.group.count({ where: { name: `${PREFIX} Route` } })).toBe(0);
  });

  it("rejects students", async () => {
    const res = await upload(student, `termId=${termId}&dryRun=true`, csv());
    expect(res.statusCode).toBe(403);
  });

  it("rejects an unknown termId", async () => {
    // A valid v4 UUID that is not a term (a malformed one would fail zod with 422 instead).
    const res = await upload(staff, `termId=4f6b2c1e-8a3d-4e5f-9b7c-1d2e3f4a5b6c&dryRun=true`, csv());
    expect(res.statusCode).toBe(400);
  });

  it("requires the X-Requested-With header", async () => {
    const res = await upload(staff, `termId=${termId}&dryRun=true`, csv(), false);
    expect(res.statusCode).toBe(403);
  });
});
```

ชื่อ cookie `labsync_session` เป็นค่าเริ่มต้นของ `SESSION_COOKIE_NAME` ใน test เหมือน `test/course-catalog.test.ts`

- [ ] **Step 2: รัน test ให้เห็นว่าไม่ผ่าน**

```bash
npm run test:fresh -- test/core/group-import.test.ts
```

Expected: test ของ route FAIL ด้วย 404

- [ ] **Step 3: เพิ่ม route ใน `src/modules/import/routes.ts`**

เพิ่ม import ด้านบน

```ts
import { z } from "zod";
import { importGroups } from "../../core/group-import.js";
```

เพิ่มไว้เหนือ `export async function importRoutes`

```ts
const groupImportQuery = z.object({
  termId: z.string().uuid().optional(),
  dryRun: z.enum(["true", "false"]).optional(),
});
```

เพิ่ม route ท้ายฟังก์ชัน `importRoutes` (หลัง `/import/rooms`)

```ts
  // Group membership from CSV (shared plan step 2). Staff-only until permissions land (step 5a).
  app.post("/import/groups", { config: { auth: "admin" } }, async (req) => {
    const q = groupImportQuery.parse(req.query);
    const termId = q.termId ?? null;
    if (termId && !(await prisma.term.findUnique({ where: { id: termId }, select: { id: true } }))) {
      throw badRequest("termId matches no term");
    }
    const records = await readCsv(req);
    return importGroups(records, { termId, dryRun: q.dryRun === "true" });
  });
```

- [ ] **Step 4: รัน test ทั้งหมด**

```bash
npm run test:fresh
npx tsc --noEmit
```

Expected: ผ่านทั้งหมดยกเว้น BR-14 (284 test เดิม + test ใหม่ 22 ตัว: users 8, groups 4, group-import 10 = 306 test, ผ่าน 305) และ `tsc` ไม่มี error ถ้าจำนวนต่างเพราะปรับ test ระหว่างทาง ให้เทียบว่าไม่มีตัวไหน fail นอกจาก BR-14

- [ ] **Step 5: Commit**

```bash
git add src/modules/import/routes.ts test/core/group-import.test.ts
git commit -m "feat(import): add POST /import/groups"
```

---

### Task 8: ตรวจรอบสุดท้ายและเปิด PR

**Files:** ไม่มี

- [ ] **Step 1: ตรวจ backend**

```bash
npm run test:fresh
npx tsc --noEmit
npx prisma migrate status
npx prisma migrate diff --from-schema-datasource prisma/schema --to-schema-datamodel prisma/schema --exit-code
```

Expected: test ผ่านยกเว้น BR-14, `tsc` ไม่มี error, `Database schema is up to date!`, `No difference detected.`

- [ ] **Step 2: ตรวจว่า migration ใหม่มีแค่สองตัวและไม่แก้ตัวเดิม**

```bash
git diff --name-status origin/core/restructure -- prisma/schema/migrations
```

Expected: มีแค่ `A` ของ `20261124120000_core_users_enrollments/migration.sql` และ `20261124130000_core_groups/migration.sql`

- [ ] **Step 3: ตรวจว่าไม่มีการ log รหัสนิสิต**

```bash
grep -rn "log\.\(info\|warn\|error\|debug\)" src/core src/modules/import
```

Expected: ไม่มีผลลัพธ์ หรือมีแต่ไม่ส่ง `studentNo` ออกไป

- [ ] **Step 4: ลองเปิดแอปและล็อกอินด้วยบัญชี seed**

```bash
npm run dev
```

Expected: log `LabSync API listening on http://localhost:3000/api/v1` และล็อกอิน `student@cedt.edu` ผ่าน frontend ได้ตามเดิม จากนั้นหยุด dev server

- [ ] **Step 5: push และเปิด PR (stacked บน #11)**

```bash
git push -u origin core/users-groups
gh pr create --base core/restructure --title "Core users and groups (shared plan step 2)" --label shared --body "$(cat <<'EOF'
ขั้นที่ 2 ของแผนของกลาง (stacked บน #11 เมื่อ #11 merge แล้ว base จะเป็น `main`)

- `users`: `password_hash` ว่างได้ (บัญชี MCV), เพิ่ม `mcv_id`, `student_no` เป็น `CHAR(10)` พร้อม CHECK ตัวเลข 10 หลัก, FK ของ advisor เป็น Restrict
- `enrollments` เป็นของกลาง: FK ของ term เป็น Restrict, เพิ่ม `created_at`/`updated_at` และ index `(term_id, course_id, section)`
- `groups` และ `group_members` (อ้างนิสิตด้วย `student_no` ไม่มี FK)
- บริการใน `src/core/`: `findUserByStudentNo()`, `groupsOfStudent()`, `importGroups()`
- `POST /api/v1/import/groups?termId=&dryRun=true` นำเข้าสมาชิกกลุ่มจาก CSV แบบเพิ่มอย่างเดียว รายงานแถวที่นิสิตยังไม่มีบัญชี
- ล็อกอินด้วยรหัสผ่านของบัญชีที่ไม่มีรหัสผ่านได้ 401 แบบเดียวกับรหัสผิด

ตรวจแล้ว
- `npm run test:fresh` ผ่านทั้งหมดยกเว้น booking-flow BR-14 ที่ fail อยู่แล้วบน `main`
- `prisma migrate diff` จากฐานข้อมูลที่ migrate แล้วกับ schema ไม่มีความต่าง
- migration ใช้กับฐานข้อมูล dev ที่มีข้อมูล seed ได้

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

push และเปิด PR เฉพาะเมื่อเจ้าของงานอนุญาต
