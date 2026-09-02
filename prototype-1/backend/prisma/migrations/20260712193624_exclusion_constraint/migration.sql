-- Extensions (the postgresqlExtensions preview feature usually creates these in the
-- init migration; IF NOT EXISTS keeps this idempotent either way).
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Generated tstzrange column on occurrences.
--    Half-open '[)' so back-to-back 10:00-12:00 / 12:00-14:00 never conflict.
--    Computed in Asia/Bangkok (single-campus system, no DST in Thailand).
ALTER TABLE booking_occurrences
  ADD COLUMN timeslot tstzrange
  GENERATED ALWAYS AS (
    tstzrange(
      ((date + start_time) AT TIME ZONE 'Asia/Bangkok'),
      ((date + end_time)   AT TIME ZONE 'Asia/Bangkok'),
      '[)'
    )
  ) STORED;

-- 2. THE G1 GUARANTEE - partial exclusion constraint.
--    Postgres refuses to commit two rows with the same room, overlapping
--    timeslots, and is_blocking = true. Violation = SQLSTATE 23P01.
ALTER TABLE booking_occurrences
  ADD CONSTRAINT no_double_booking
  EXCLUDE USING gist (room_id WITH =, timeslot WITH &&)
  WHERE (is_blocking);

-- 3. CHECK constraints Prisma cannot declare.
ALTER TABLE booking_occurrences
  ADD CONSTRAINT occ_time_order CHECK (end_time > start_time);

ALTER TABLE bookings
  ADD CONSTRAINT bk_time_order CHECK (end_time > start_time),
  ADD CONSTRAINT bk_30min_grid CHECK (
    EXTRACT(minute FROM start_time) IN (0, 30)
    AND EXTRACT(minute FROM end_time) IN (0, 30)
  ),
  ADD CONSTRAINT bk_shape CHECK (
    (booking_type = 'recurring' AND day_of_week IS NOT NULL
       AND start_date IS NOT NULL AND end_date IS NOT NULL AND one_off_date IS NULL)
    OR
    (booking_type = 'one_off' AND one_off_date IS NOT NULL AND day_of_week IS NULL)
  ),
  ADD CONSTRAINT bk_day_of_week_range CHECK (day_of_week BETWEEN 0 AND 6),
  ADD CONSTRAINT bk_student_count CHECK (student_count >= 1),
  ADD CONSTRAINT bk_reject_reason CHECK (
    status <> 'rejected' OR length(reject_reason) >= 10
  );

ALTER TABLE rooms
  ADD CONSTRAINT room_capacity CHECK (capacity >= 1);

ALTER TABLE terms
  ADD CONSTRAINT term_number_range CHECK (term_number IN (1, 2, 3)),
  ADD CONSTRAINT term_date_order   CHECK (end_date > start_date);

-- 4. Exactly one active term.
CREATE UNIQUE INDEX one_active_term ON terms ((true)) WHERE is_active;

-- 5. Human-readable request numbers: LS-<year>-<5-digit sequence>.
CREATE SEQUENCE booking_request_seq START 1;
