-- Hand-trimmed from `prisma migrate diff` output: the DROP of booking_occurrences.timeslot (raw-SQL generated column, not in the schema) is removed on purpose.

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "granted_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "user_permissions" (
    "user_id" UUID NOT NULL,
    "permission" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "granted_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("user_id","permission")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


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
