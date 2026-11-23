-- DATA-001: realistic CEDT course catalog for Course Change (docs/course-change/DATABASE.md).
-- Additive and non-destructive: one new nullable column on courses, NOT NULL relaxed on two
-- enrollment columns, one new nullable column on enrollments. No data is rewritten or dropped.

-- Provenance marker; Course Change only considers courses with a catalog source.
ALTER TABLE "courses" ADD COLUMN "catalog_source" TEXT;

-- Demo enrollments must not invent official sections or credits, so both become optional.
ALTER TABLE "enrollments" ALTER COLUMN "section" DROP NOT NULL;
ALTER TABLE "enrollments" ALTER COLUMN "credits" DROP NOT NULL;

-- Provenance of the enrollment row ("synthetic-demo" for seeded demo data).
ALTER TABLE "enrollments" ADD COLUMN "source" TEXT;
