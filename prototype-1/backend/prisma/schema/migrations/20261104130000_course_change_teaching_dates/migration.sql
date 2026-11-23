ALTER TABLE course_change_schedules ADD COLUMN teaching_starts_on date, ADD COLUMN teaching_ends_on date,
 ADD CONSTRAINT course_change_teaching_dates_order CHECK (
 (teaching_starts_on IS NULL AND teaching_ends_on IS NULL) OR
 (teaching_starts_on IS NOT NULL AND teaching_ends_on IS NOT NULL AND teaching_starts_on <= teaching_ends_on));
