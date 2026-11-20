CREATE TYPE "announcement_status" AS ENUM ('draft', 'published');

CREATE TYPE "announcement_audience" AS ENUM ('all', 'year1', 'year2', 'year3', 'year4');

CREATE TABLE "announcements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "audiences" "announcement_audience"[] NOT NULL DEFAULT ARRAY[]::"announcement_audience"[],
    "status" "announcement_status" NOT NULL DEFAULT 'draft',
    "author_id" UUID NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "announcements_status_updated_at_idx" ON "announcements"("status", "updated_at" DESC);
CREATE INDEX "announcements_author_id_idx" ON "announcements"("author_id");

ALTER TABLE "announcements"
    ADD CONSTRAINT "announcements_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
