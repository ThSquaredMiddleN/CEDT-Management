-- Step 6 (shared plan 3.7): file metadata table; contents live in fileStore.
-- course_change_files.data and news_images.storage_key stay until files:backfill moves them
-- (dropped in 20261125140100_files_drop_legacy).

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "module" TEXT NOT NULL,
    "uploaded_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "course_change_files" ADD COLUMN     "file_id" UUID,
ALTER COLUMN "data" DROP NOT NULL;

-- AlterTable
ALTER TABLE "news_images" ADD COLUMN     "file_id" UUID,
ALTER COLUMN "storage_key" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "files_storage_key_key" ON "files"("storage_key");

-- CreateIndex
CREATE INDEX "files_module_created_at_idx" ON "files"("module", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "course_change_files_file_id_key" ON "course_change_files"("file_id");

-- CreateIndex
CREATE UNIQUE INDEX "news_images_file_id_key" ON "news_images"("file_id");

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_change_files" ADD CONSTRAINT "course_change_files_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_images" ADD CONSTRAINT "news_images_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
