import { pathToFileURL } from "node:url";
import { config } from "../src/config.js";
import { removeStoredFile } from "../src/core/files.js";
import { prisma, type Tx } from "../src/db.js";
import { deleteCheckFileRecord } from "../src/modules/receipts/service.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Best effort: a failure leaves an orphan that scripts/files-sweep.ts removes later. */
async function removeContents(keys: string[]): Promise<void> {
  for (const storageKey of keys) {
    try {
      await removeStoredFile(storageKey);
    } catch (error) {
      console.error(`could not remove receipt file contents (${storageKey}); files:sweep will clear it`, error);
    }
  }
}

/** Runs one row's changes in its own transaction. A failure is logged by id and returns null, so the run goes on. */
async function ownTransaction<T>(id: string, work: (tx: Tx) => Promise<T>): Promise<{ value: T } | null> {
  try {
    return { value: await prisma.$transaction((tx) => work(tx)) };
  } catch (error) {
    console.error(`receipt check ${id} not purged; the run goes on (${error instanceof Error ? error.name : "error"})`);
    return null;
  }
}

/**
 * Two cut-offs:
 * - rows created more than `retentionDays` ago are deleted, with their files;
 * - rows created more than `fileDays` ago lose their stored copy and OCR'd name (the check itself stays).
 * Each row is changed in its own transaction, so one bad row does not stop the others. A row whose file row is
 * already gone still goes (see deleteCheckFileRecord). Returns how many rows were deleted and how many had their
 * file/name cleared.
 */
export async function purgeReceiptChecks(
  opts: { retentionDays?: number; fileDays?: number; now?: Date } = {},
): Promise<{ deleted: number; filesCleared: number }> {
  const now = (opts.now ?? new Date()).getTime();
  const rowCutoff = new Date(now - (opts.retentionDays ?? config.RECEIPT_RETENTION_DAYS) * DAY_MS);
  const fileCutoff = new Date(now - (opts.fileDays ?? config.RECEIPT_FILE_DAYS) * DAY_MS);

  let deleted = 0;
  const keys: string[] = [];
  const old = await prisma.receiptCheck.findMany({
    where: { createdAt: { lt: rowCutoff } },
    select: { id: true, fileId: true },
  });
  for (const row of old) {
    const done = await ownTransaction(row.id, async (tx) => {
      const storageKey = row.fileId ? await deleteCheckFileRecord(tx, row.fileId) : null;
      await tx.receiptCheck.deleteMany({ where: { id: row.id } });
      return storageKey;
    });
    if (done) {
      deleted += 1;
      if (done.value) keys.push(done.value);
    }
  }
  await removeContents(keys);

  // Rows past the file window lose the copy and the name (an unsettled warn keeps its name until now), so select on either.
  const stale = await prisma.receiptCheck.findMany({
    where: { createdAt: { lt: fileCutoff }, OR: [{ fileId: { not: null } }, { ocrName: { not: null } }] },
    select: { id: true, fileId: true },
  });
  let filesCleared = 0;
  const fileKeys: string[] = [];
  for (const row of stale) {
    const done = await ownTransaction(row.id, async (tx) => {
      const storageKey = row.fileId ? await deleteCheckFileRecord(tx, row.fileId) : null;
      await tx.receiptCheck.updateMany({ where: { id: row.id }, data: { fileId: null, ocrName: null } });
      return storageKey;
    });
    if (done) {
      filesCleared += 1;
      if (done.value) fileKeys.push(done.value);
    }
  }
  await removeContents(fileKeys);

  return { deleted, filesCleared };
}

// Run as a CLI only when executed directly, so tests can import the function without side effects.
const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const { deleted, filesCleared } = await purgeReceiptChecks();
    console.log(`receipt checks purged: ${deleted} (older than ${config.RECEIPT_RETENTION_DAYS} days)`);
    console.log(`receipt files/names cleared: ${filesCleared} (older than ${config.RECEIPT_FILE_DAYS} days)`);
  } finally {
    await prisma.$disconnect();
  }
}
