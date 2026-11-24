CREATE TYPE "news_status" AS ENUM ('draft', 'published');

CREATE TYPE "news_tag" AS ENUM (
    'competition',
    'activities',
    'scholarship',
    'internship',
    'academic',
    'other'
);

CREATE TABLE "news_articles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "tags" "news_tag"[] NOT NULL DEFAULT ARRAY[]::"news_tag"[],
    "status" "news_status" NOT NULL DEFAULT 'draft',
    "author_id" UUID NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "news_articles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "news_images" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "news_id" UUID NOT NULL,
    "storage_key" VARCHAR(80) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(32) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "news_images_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "news_images_storage_key_key" ON "news_images"("storage_key");
CREATE INDEX "news_articles_status_updated_at_idx" ON "news_articles"("status", "updated_at" DESC);
CREATE INDEX "news_articles_author_id_idx" ON "news_articles"("author_id");
CREATE INDEX "news_images_news_id_position_idx" ON "news_images"("news_id", "position");

ALTER TABLE "news_articles"
    ADD CONSTRAINT "news_articles_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "news_images"
    ADD CONSTRAINT "news_images_news_id_fkey"
    FOREIGN KEY ("news_id") REFERENCES "news_articles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
