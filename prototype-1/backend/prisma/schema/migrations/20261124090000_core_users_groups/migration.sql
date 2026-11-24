-- Step 2 of the shared-objects plan (docs: 2026-11-23-shared-backend-objects, section 3.2-3.4).
-- users: password optional (MCV-only accounts), mcv_id, student_no as CHAR(10).
-- enrollments: shared table; term FK changes from CASCADE to RESTRICT; timestamps.
-- groups, group_members: new.

-- CreateEnum
CREATE TYPE "group_type" AS ENUM ('course_section', 'club', 'project', 'personal');

-- CreateEnum
CREATE TYPE "group_member_role" AS ENUM ('member', 'leader');

-- DropForeignKey
ALTER TABLE "enrollments" DROP CONSTRAINT "enrollments_term_id_fkey";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mcv_id" TEXT,
ALTER COLUMN "password_hash" DROP NOT NULL,
ALTER COLUMN "student_no" SET DATA TYPE CHAR(10);

-- AlterTable
ALTER TABLE "enrollments" ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Existing rows get the migration time; Prisma's @updatedAt sets it from now on, so drop the default.
ALTER TABLE "enrollments" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "group_type" NOT NULL,
    "name" TEXT NOT NULL,
    "course_id" UUID,
    "term_id" UUID,
    "section" TEXT,
    "created_by" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_members" (
    "group_id" UUID NOT NULL,
    "student_no" CHAR(10) NOT NULL,
    "role" "group_member_role" NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("group_id","student_no")
);

-- CreateIndex
CREATE INDEX "groups_type_is_active_idx" ON "groups"("type", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "groups_term_id_course_id_section_name_key" ON "groups"("term_id", "course_id", "section", "name");

-- CreateIndex
CREATE INDEX "group_members_student_no_idx" ON "group_members"("student_no");

-- CreateIndex
CREATE UNIQUE INDEX "users_mcv_id_key" ON "users"("mcv_id");

-- CreateIndex
CREATE INDEX "enrollments_term_id_course_id_section_idx" ON "enrollments"("term_id", "course_id", "section");

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- CHECKs Prisma cannot express.
-- CHAR(10) pads short values with spaces, so require exactly 10 digits. Fails loudly if existing data does not fit.
ALTER TABLE "users" ADD CONSTRAINT "users_student_no_format" CHECK ("student_no" ~ '^[0-9]{10}$');
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_student_no_format" CHECK ("student_no" ~ '^[0-9]{10}$');
-- A course_section group belongs to one course in one term.
ALTER TABLE "groups" ADD CONSTRAINT "groups_course_section_needs_course_term"
  CHECK ("type" <> 'course_section' OR ("course_id" IS NOT NULL AND "term_id" IS NOT NULL));
