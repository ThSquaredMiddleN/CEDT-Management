-- Step 6, part 2: drop the legacy file columns. Fresh databases pass straight through.
-- A database with rows saved before step 6 must run files:backfill first.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "course_change_files" WHERE "file_id" IS NULL)
     OR EXISTS (SELECT 1 FROM "news_images" WHERE "file_id" IS NULL) THEN
    RAISE EXCEPTION 'Files not moved yet. Run "npm run files:backfill", then "npx prisma migrate resolve --rolled-back 20261125140100_files_drop_legacy", then deploy again.';
  END IF;
END $$;

ALTER TABLE "course_change_files" DROP COLUMN "data", ALTER COLUMN "file_id" SET NOT NULL;

DROP INDEX "news_images_storage_key_key";
ALTER TABLE "news_images" DROP COLUMN "storage_key", ALTER COLUMN "file_id" SET NOT NULL;
