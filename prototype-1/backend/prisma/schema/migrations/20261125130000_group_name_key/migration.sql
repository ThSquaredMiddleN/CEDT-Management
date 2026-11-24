-- groups: a stored, normalised name key, so "Group 09" and "group 09" cannot both exist in the same term / course /
-- section. The key is filled from the existing name with the same normalisation as groupNameKey() in
-- src/core/groups.ts (trim, collapse whitespace, lower-case). If existing rows already share a key, the unique
-- index creation below fails; that is deliberate (no dedupe here).
ALTER TABLE "groups" ADD COLUMN "name_key" TEXT;
UPDATE "groups" SET "name_key" = lower(btrim(regexp_replace("name", '\s+', ' ', 'g')));
ALTER TABLE "groups" ALTER COLUMN "name_key" SET NOT NULL;

DROP INDEX "groups_term_id_course_id_section_name_key";
-- NULLS NOT DISTINCT as in 20261124100000_groups_unique_nulls_not_distinct (needs Postgres 15+).
CREATE UNIQUE INDEX "groups_term_id_course_id_section_name_key_key" ON "groups"("term_id", "course_id", "section", "name_key") NULLS NOT DISTINCT;
