-- core notifications (team plan 3.5): one table for every module.
-- type: enum -> text "<module>.<event>"; booking_id / course_change_request_id -> module + subject_id + link.
-- Hand-written so existing rows are kept (Prisma's diff would drop the columns and the enum data).

ALTER TABLE "notifications"
  ADD COLUMN "module" TEXT,
  ADD COLUMN "subject_id" TEXT,
  ADD COLUMN "link" TEXT,
  ADD COLUMN "read_at" TIMESTAMPTZ(6);

ALTER TABLE "notifications" ALTER COLUMN "type" TYPE TEXT USING (
  CASE "type"::text
    WHEN 'request_submitted' THEN 'bookings.request_submitted'
    WHEN 'request_approved' THEN 'bookings.request_approved'
    WHEN 'request_rejected' THEN 'bookings.request_rejected'
    WHEN 'booking_moved' THEN 'bookings.booking_moved'
    WHEN 'booking_cancelled_by_instructor' THEN 'bookings.booking_cancelled_by_instructor'
    WHEN 'request_withdrawn' THEN 'bookings.request_withdrawn'
    WHEN 'cc_submitted' THEN 'course_change.submitted'
    WHEN 'cc_approved' THEN 'course_change.approved'
    WHEN 'cc_rejected' THEN 'course_change.rejected'
    WHEN 'cc_completed' THEN 'course_change.completed'
    WHEN 'cc_cancelled' THEN 'course_change.cancelled'
  END
);

UPDATE "notifications" SET
  "module" = CASE
    WHEN "booking_id" IS NOT NULL THEN 'bookings'
    WHEN "course_change_request_id" IS NOT NULL THEN 'course_change'
    ELSE split_part("type", '.', 1)
  END,
  "subject_id" = CASE
    WHEN "booking_id" IS NOT NULL THEN "booking_id"::text
    WHEN "course_change_request_id" IS NOT NULL THEN "course_change_request_id"::text
    ELSE NULL
  END;

ALTER TABLE "notifications" ALTER COLUMN "module" SET NOT NULL;

-- Same rules as new rows get at write time: course change rows open the request's tracking view; booking rows
-- open /requests for the booking's instructor or requester and /admin/dashboard for anyone else (staff);
-- request_submitted always goes to staff, so it always opens /admin/dashboard.
UPDATE "notifications" n SET "link" = CASE
    WHEN n."type" LIKE 'course_change.%' THEN
      CASE WHEN n."course_change_request_id" IS NOT NULL
        THEN '/course-change?view=tracking&request=' || n."course_change_request_id"::text
        ELSE '/course-change?view=tracking'
      END
    WHEN n."type" = 'bookings.request_submitted' THEN '/admin/dashboard'
    WHEN EXISTS (
      SELECT 1 FROM "bookings" b
      WHERE b."id" = n."booking_id" AND n."user_id" IN (b."instructor_id", b."requested_by")
    ) THEN '/requests'
    ELSE '/admin/dashboard'
  END;

UPDATE "notifications" SET "read_at" = "created_at" WHERE "is_read";

ALTER TABLE "notifications"
  DROP CONSTRAINT "notifications_booking_id_fkey",
  DROP CONSTRAINT "notifications_course_change_request_id_fkey";

ALTER TABLE "notifications"
  DROP COLUMN "booking_id",
  DROP COLUMN "course_change_request_id";

DROP TYPE "notification_type";

CREATE INDEX "notifications_module_subject_id_idx" ON "notifications"("module", "subject_id");
CREATE INDEX "notifications_delivered_line_at_idx" ON "notifications"("delivered_line_at");
