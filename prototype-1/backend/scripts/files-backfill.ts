import { readFile as readDisk } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { config } from "../src/config.js";
import { withFileTransaction } from "../src/core/files.js";
import { prisma } from "../src/db.js";

/**
 * Moves file contents saved before step 6 into fileStore:
 * - course_change_files.data (bytea)
 * - news_images.storage_key (a file in NEWS_UPLOAD_DIR)
 * Run it after migration 20261125140000_files and before 20261125140100_files_drop_legacy.
 * dropMissing: delete news_images rows whose file is no longer on disk (otherwise they block the migration).
 */
export async function backfillFiles(opts: { dropMissing?: boolean } = {}) {
  const result = { courseChange: 0, news: 0, missingNews: 0, droppedNews: 0 };

  const ccRows = await prisma.$queryRaw<{ id: string; filename: string; data: Buffer | null; uploader_id: string }[]>`
    SELECT "id", "filename", "data", "uploader_id" FROM "course_change_files" WHERE "file_id" IS NULL`;
  for (const row of ccRows) {
    if (!row.data || row.data.length === 0) continue;
    await withFileTransaction(async (tx, files) => {
      const saved = await files.save({
        buffer: Buffer.from(row.data!),
        mime: "application/pdf",
        originalName: row.filename,
        module: "course_change",
        uploadedBy: row.uploader_id,
      });
      await tx.$executeRaw`UPDATE "course_change_files" SET "file_id" = ${saved.id}::uuid WHERE "id" = ${row.id}::uuid AND "file_id" IS NULL`;
    });
    result.courseChange++;
  }

  const newsRows = await prisma.$queryRaw<{ id: string; storage_key: string | null; original_name: string; mime_type: string }[]>`
    SELECT "id", "storage_key", "original_name", "mime_type" FROM "news_images" WHERE "file_id" IS NULL`;
  for (const row of newsRows) {
    let buffer: Buffer | null = null;
    if (row.storage_key) {
      try {
        buffer = await readDisk(path.join(path.resolve(config.NEWS_UPLOAD_DIR), path.basename(row.storage_key)));
      } catch {
        buffer = null;
      }
    }
    if (!buffer) {
      result.missingNews++;
      if (opts.dropMissing) {
        await prisma.$executeRaw`DELETE FROM "news_images" WHERE "id" = ${row.id}::uuid AND "file_id" IS NULL`;
        result.droppedNews++;
      }
      continue;
    }
    await withFileTransaction(async (tx, files) => {
      const saved = await files.save({
        buffer: buffer!,
        mime: row.mime_type,
        originalName: row.original_name,
        module: "news",
        uploadedBy: null,
      });
      await tx.$executeRaw`UPDATE "news_images" SET "file_id" = ${saved.id}::uuid WHERE "id" = ${row.id}::uuid AND "file_id" IS NULL`;
    });
    result.news++;
  }
  return result;
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const r = await backfillFiles({ dropMissing: process.argv.includes("--drop-missing") });
    console.log(
      `files backfill: course change PDFs ${r.courseChange}, news images ${r.news}, ` +
        `news images missing on disk ${r.missingNews}${r.droppedNews ? ` (rows dropped ${r.droppedNews})` : ""}`,
    );
    if (r.missingNews > r.droppedNews) {
      console.log("Some news images are missing on disk. Re-run with --drop-missing to delete those rows.");
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}
