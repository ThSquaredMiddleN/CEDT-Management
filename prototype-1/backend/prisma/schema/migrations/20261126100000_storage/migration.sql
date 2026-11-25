-- CreateEnum
CREATE TYPE "storage_unit_status" AS ENUM ('available', 'out', 'qc', 'damaged', 'lost');

-- CreateEnum
CREATE TYPE "storage_request_status" AS ENUM ('open', 'ready_for_pickup', 'closed', 'unfulfilled', 'cancelled', 'rejected');

-- CreateEnum
CREATE TYPE "storage_cancel_reason" AS ENUM ('by_student', 'restock_expired');

-- CreateEnum
CREATE TYPE "storage_channel" AS ENUM ('click_collect', 'walk_in');

-- CreateEnum
CREATE TYPE "storage_pickup_location" AS ENUM ('locker', 'counter', 'lab');

-- CreateEnum
CREATE TYPE "storage_owed_status" AS ENUM ('owed', 'not_brought');

-- CreateEnum
CREATE TYPE "storage_qc_status" AS ENUM ('open', 'pending_payment', 'closed');

-- CreateEnum
CREATE TYPE "storage_qc_item_status" AS ENUM ('pending_test', 'available', 'damaged', 'lost');

-- CreateTable
CREATE TABLE "storage_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_unique" BOOLEAN NOT NULL,
    "bulk_available" INTEGER NOT NULL DEFAULT 0,
    "bulk_qc" INTEGER NOT NULL DEFAULT 0,
    "bulk_damaged" INTEGER NOT NULL DEFAULT 0,
    "bulk_lost" INTEGER NOT NULL DEFAULT 0,
    "bulk_total" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "storage_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_units" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "serial" TEXT NOT NULL,
    "item_id" UUID NOT NULL,
    "status" "storage_unit_status" NOT NULL DEFAULT 'available',
    "request_id" UUID,

    CONSTRAINT "storage_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_no" TEXT NOT NULL,
    "channel" "storage_channel" NOT NULL,
    "group_id" UUID,
    "requested_by" UUID,
    "student_no" CHAR(10) NOT NULL,
    "status" "storage_request_status" NOT NULL DEFAULT 'open',
    "cancel_reason" "storage_cancel_reason",
    "reject_reason" TEXT,
    "rejected_by" UUID,
    "rejected_at" TIMESTAMPTZ(6),
    "pickup_at" TIMESTAMPTZ(6),
    "pickup_location" "storage_pickup_location",
    "pickup_remark" TEXT,
    "picked_up_at" TIMESTAMPTZ(6),
    "due_at" TIMESTAMPTZ(6),
    "restock_flagged_at" TIMESTAMPTZ(6),
    "restock_expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "storage_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_request_lines" (
    "request_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "req_qty" INTEGER NOT NULL,
    "issued_qty" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "storage_request_lines_pkey" PRIMARY KEY ("request_id","item_id")
);

-- CreateTable
CREATE TABLE "storage_reservations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "qty" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "storage_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_owed_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "serial" TEXT,
    "qty" INTEGER NOT NULL,
    "status" "storage_owed_status" NOT NULL DEFAULT 'owed',
    "not_brought_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storage_owed_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_qc_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_no" TEXT NOT NULL,
    "status" "storage_qc_status" NOT NULL DEFAULT 'open',
    "kind" TEXT NOT NULL,
    "group_label" TEXT NOT NULL,
    "requester_label" TEXT NOT NULL,
    "fine_satang" INTEGER NOT NULL DEFAULT 0,
    "fine_remark" TEXT NOT NULL DEFAULT '',
    "slip_amount_satang" INTEGER,
    "slip_transferred_at" TEXT,
    "slip_ref" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "storage_qc_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_qc_task_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" UUID NOT NULL,
    "request_id" UUID,
    "item_id" UUID NOT NULL,
    "serial" TEXT,
    "qty" INTEGER NOT NULL,
    "status" "storage_qc_item_status" NOT NULL DEFAULT 'pending_test',
    "res_available" INTEGER NOT NULL DEFAULT 0,
    "res_damaged" INTEGER NOT NULL DEFAULT 0,
    "res_lost" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "storage_qc_task_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "default_due_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "storage_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "storage_items_code_key" ON "storage_items"("code");

-- CreateIndex
CREATE UNIQUE INDEX "storage_units_serial_key" ON "storage_units"("serial");

-- CreateIndex
CREATE INDEX "storage_units_item_id_status_idx" ON "storage_units"("item_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "storage_requests_request_no_key" ON "storage_requests"("request_no");

-- CreateIndex
CREATE INDEX "storage_requests_status_created_at_idx" ON "storage_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "storage_requests_group_id_idx" ON "storage_requests"("group_id");

-- CreateIndex
CREATE INDEX "storage_requests_student_no_idx" ON "storage_requests"("student_no");

-- CreateIndex
CREATE UNIQUE INDEX "storage_reservations_request_id_item_id_key" ON "storage_reservations"("request_id", "item_id");

-- CreateIndex
CREATE INDEX "storage_owed_items_request_id_idx" ON "storage_owed_items"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "storage_qc_tasks_task_no_key" ON "storage_qc_tasks"("task_no");

-- CreateIndex
CREATE INDEX "storage_qc_task_items_task_id_idx" ON "storage_qc_task_items"("task_id");

-- AddForeignKey
ALTER TABLE "storage_units" ADD CONSTRAINT "storage_units_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "storage_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_units" ADD CONSTRAINT "storage_units_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "storage_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_requests" ADD CONSTRAINT "storage_requests_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_requests" ADD CONSTRAINT "storage_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_requests" ADD CONSTRAINT "storage_requests_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_request_lines" ADD CONSTRAINT "storage_request_lines_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "storage_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_request_lines" ADD CONSTRAINT "storage_request_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "storage_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_reservations" ADD CONSTRAINT "storage_reservations_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "storage_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_reservations" ADD CONSTRAINT "storage_reservations_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "storage_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_owed_items" ADD CONSTRAINT "storage_owed_items_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "storage_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_owed_items" ADD CONSTRAINT "storage_owed_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "storage_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_qc_task_items" ADD CONSTRAINT "storage_qc_task_items_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "storage_qc_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_qc_task_items" ADD CONSTRAINT "storage_qc_task_items_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "storage_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_qc_task_items" ADD CONSTRAINT "storage_qc_task_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "storage_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-written (Prisma cannot express these). Spec §4.
ALTER TABLE "storage_items" ADD CONSTRAINT "storage_items_counts_check" CHECK (
  "bulk_available" >= 0 AND "bulk_qc" >= 0 AND "bulk_damaged" >= 0 AND "bulk_lost" >= 0 AND "bulk_total" >= 0
  AND "bulk_available" + "bulk_qc" + "bulk_damaged" + "bulk_lost" <= "bulk_total"
  AND (NOT "is_unique" OR ("bulk_available" = 0 AND "bulk_qc" = 0 AND "bulk_damaged" = 0 AND "bulk_lost" = 0 AND "bulk_total" = 0))
);
ALTER TABLE "storage_requests" ADD CONSTRAINT "storage_requests_student_no_check" CHECK ("student_no" ~ '^[0-9]{10}$');
ALTER TABLE "storage_requests" ADD CONSTRAINT "storage_requests_rejected_check"
  CHECK ("status" <> 'rejected' OR ("reject_reason" IS NOT NULL AND "rejected_by" IS NOT NULL));
ALTER TABLE "storage_requests" ADD CONSTRAINT "storage_requests_cancelled_check"
  CHECK ("status" <> 'cancelled' OR "cancel_reason" IS NOT NULL);
ALTER TABLE "storage_request_lines" ADD CONSTRAINT "storage_request_lines_qty_check"
  CHECK ("req_qty" >= 1 AND "issued_qty" >= 0 AND "issued_qty" <= "req_qty");
ALTER TABLE "storage_reservations" ADD CONSTRAINT "storage_reservations_qty_check" CHECK ("qty" >= 1);
ALTER TABLE "storage_owed_items" ADD CONSTRAINT "storage_owed_items_qty_check"
  CHECK ("qty" >= 1 AND ("serial" IS NULL OR "qty" = 1));
ALTER TABLE "storage_qc_tasks" ADD CONSTRAINT "storage_qc_tasks_fine_check" CHECK ("fine_satang" >= 0);
ALTER TABLE "storage_settings" ADD CONSTRAINT "storage_settings_single_row" CHECK ("id" = 1);

-- Display numbers: REQ-B-<n> and REQ-R-<n>. Seed rows use REQ-B-100..104 and REQ-R-201..204.
CREATE SEQUENCE "storage_request_seq" START 105;
CREATE SEQUENCE "storage_qc_task_seq" START 300;

-- The single settings row (end of semester 2026/2).
INSERT INTO "storage_settings" ("id", "default_due_at", "updated_at") VALUES (1, '2027-03-31 17:00:00+07', CURRENT_TIMESTAMP);

-- Roles (shared plan 1.2) and the student role's storage.use.
INSERT INTO "roles" ("key", "name", "description", "is_system", "updated_at") VALUES
  ('storage_staff', 'เจ้าหน้าที่คลัง', 'จัดการคลังอุปกรณ์ทุกส่วน', false, CURRENT_TIMESTAMP),
  ('storage_ta',    'TA ตรวจสภาพ',    'ตรวจสภาพอุปกรณ์ที่คืน ถอนเองเมื่อจบเทอม', false, CURRENT_TIMESTAMP);

INSERT INTO "role_permissions" ("role_id", "permission")
SELECT r."id", p.permission
FROM "roles" r
JOIN (VALUES
  ('student', 'storage.use'),
  ('storage_staff', 'storage.view'), ('storage_staff', 'storage.manage.counter'),
  ('storage_staff', 'storage.manage.qc'), ('storage_staff', 'storage.manage.inventory'),
  ('storage_staff', 'storage.manage.payment'),
  ('storage_ta', 'storage.view'), ('storage_ta', 'storage.manage.qc'),
  ('audit', 'storage.view')
) AS p(role_key, permission) ON p.role_key = r."key";
