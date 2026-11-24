-- AlterTable
ALTER TABLE "notifications" ADD COLUMN "send_line" BOOLEAN NOT NULL DEFAULT true;

-- Rows written before this column existed: keep the old dispatcher rule (course change goes to LINE for
-- students only), so undelivered staff rows are not pushed after deploy.
UPDATE "notifications" SET "send_line" = false
WHERE "module" = 'course_change'
  AND "user_id" IN (SELECT "id" FROM "users" WHERE "student_no" IS NULL);
