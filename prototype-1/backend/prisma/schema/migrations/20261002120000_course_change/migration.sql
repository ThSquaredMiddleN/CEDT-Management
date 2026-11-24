-- Course Change (Auto Drop/Withdrawal Portal) — docs/course-change/DESIGN.md
-- Generated with `prisma migrate diff`, then hand-edited:
--   * removed the DROP of booking_occurrences.timeslot (a generated column Prisma cannot see)
--   * appended the raw SQL below the generated part (sequence, partial index, CHECKs)

-- CreateEnum
CREATE TYPE "course_change_type" AS ENUM ('drop', 'withdraw');

-- CreateEnum
CREATE TYPE "course_change_flow" AS ENUM ('reg_direct', 'advisor_pi', 'program_registrar');

-- CreateEnum
CREATE TYPE "course_change_status" AS ENUM ('pending_approval', 'processing', 'completed', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "course_change_event_type" AS ENUM ('submitted', 'approved', 'rejected', 'cancelled', 'document_generated', 'sent_to_reg_chula', 'sent_to_pi', 'forwarded_to_registrar', 'completed');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "notification_type" ADD VALUE 'cc_submitted';
ALTER TYPE "notification_type" ADD VALUE 'cc_approved';
ALTER TYPE "notification_type" ADD VALUE 'cc_rejected';
ALTER TYPE "notification_type" ADD VALUE 'cc_completed';
ALTER TYPE "notification_type" ADD VALUE 'cc_cancelled';

-- AlterEnum
ALTER TYPE "user_role" ADD VALUE 'student';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "course_change_request_id" UUID;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "advisor_id" UUID,
ADD COLUMN     "student_no" TEXT;

-- CreateTable
CREATE TABLE "course_change_windows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "term_id" UUID NOT NULL,
    "request_type" "course_change_type" NOT NULL,
    "week_from" SMALLINT NOT NULL,
    "week_to" SMALLINT NOT NULL,
    "flow" "course_change_flow" NOT NULL,

    CONSTRAINT "course_change_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allowed_courses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "term_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "allow_drop" BOOLEAN NOT NULL DEFAULT true,
    "allow_withdraw" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,

    CONSTRAINT "allowed_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "section" TEXT NOT NULL,
    "credits" SMALLINT NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_change_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_no" TEXT NOT NULL,
    "student_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "request_type" "course_change_type" NOT NULL,
    "flow" "course_change_flow" NOT NULL,
    "week_no" SMALLINT NOT NULL,
    "status" "course_change_status" NOT NULL,
    "reason" TEXT NOT NULL,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "reject_reason" TEXT,
    "document_hash" TEXT,
    "document_generated_at" TIMESTAMPTZ(6),
    "reg_chula_ref" TEXT,
    "pi_ref" TEXT,
    "completed_at" TIMESTAMPTZ(6),
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "course_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_change_events" (
    "id" BIGSERIAL NOT NULL,
    "request_id" UUID NOT NULL,
    "actor_id" UUID,
    "event_type" "course_change_event_type" NOT NULL,
    "note" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_change_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "course_change_windows_term_id_request_type_week_from_key" ON "course_change_windows"("term_id", "request_type", "week_from");

-- CreateIndex
CREATE UNIQUE INDEX "allowed_courses_term_id_course_id_key" ON "allowed_courses"("term_id", "course_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_student_id_term_id_course_id_key" ON "enrollments"("student_id", "term_id", "course_id");

-- CreateIndex
CREATE UNIQUE INDEX "course_change_requests_request_no_key" ON "course_change_requests"("request_no");

-- CreateIndex
CREATE INDEX "course_change_requests_status_created_at_idx" ON "course_change_requests"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "course_change_requests_student_id_created_at_idx" ON "course_change_requests"("student_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "course_change_events_request_id_created_at_idx" ON "course_change_events"("request_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_student_no_key" ON "users"("student_no");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_advisor_id_fkey" FOREIGN KEY ("advisor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_course_change_request_id_fkey" FOREIGN KEY ("course_change_request_id") REFERENCES "course_change_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_change_windows" ADD CONSTRAINT "course_change_windows_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allowed_courses" ADD CONSTRAINT "allowed_courses_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allowed_courses" ADD CONSTRAINT "allowed_courses_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_change_requests" ADD CONSTRAINT "course_change_requests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_change_requests" ADD CONSTRAINT "course_change_requests_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_change_requests" ADD CONSTRAINT "course_change_requests_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_change_requests" ADD CONSTRAINT "course_change_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_change_events" ADD CONSTRAINT "course_change_events_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "course_change_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_change_events" ADD CONSTRAINT "course_change_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- ---------------------------------------------------------------- hand-written
-- Request numbers CR-<year>-<00001> (same pattern as booking_request_seq).
CREATE SEQUENCE course_change_request_seq START 1;

-- CC-BR-2: at most one live request (pending / processing / completed) per student, course
-- and term. Rejected and cancelled requests do not count, so a student can try again.
CREATE UNIQUE INDEX one_live_course_change
  ON course_change_requests (student_id, course_id, term_id)
  WHERE status IN ('pending_approval', 'processing', 'completed');

ALTER TABLE course_change_windows
  ADD CONSTRAINT ccw_week_order CHECK (week_from >= 1 AND week_to >= week_from);

-- CC-BR-6: a rejection always carries its reason.
ALTER TABLE course_change_requests
  ADD CONSTRAINT ccr_reject_reason CHECK (status <> 'rejected' OR reject_reason IS NOT NULL);
