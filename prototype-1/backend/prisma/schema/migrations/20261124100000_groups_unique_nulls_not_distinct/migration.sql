-- groups: treat empty course / term / section as equal in the unique key, so two clubs with the same name and
-- no term cannot both exist (Postgres treats NULLs as distinct by default). Needs Postgres 15+.
-- Prisma cannot express NULLS NOT DISTINCT; the index keeps the name Prisma expects, so no drift is reported.
DROP INDEX "groups_term_id_course_id_section_name_key";
CREATE UNIQUE INDEX "groups_term_id_course_id_section_name_key" ON "groups"("term_id", "course_id", "section", "name") NULLS NOT DISTINCT;
