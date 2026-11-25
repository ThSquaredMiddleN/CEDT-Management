import { pathToFileURL } from "node:url";
import { fileStore } from "../src/core/file-store.js";
import { prisma } from "../src/db.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** "YYYY/MM/" for this month and the `months - 1` months before it (UTC). */
function monthPrefixes(now: Date, months: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/`);
  }
  return out;
}

/**
 * Removes contents in fileStore that have no `files` row and are older than one day (shared plan 2.9):
 * uploads whose transaction rolled back, or rows whose contents could not be removed after delete.
 * Returns the removed storage keys.
 */
export async function sweepOrphanFiles(opts: { now?: Date; months?: number; minAgeMs?: number } = {}): Promise<string[]> {
  const now = opts.now ?? new Date();
  const cutoff = now.getTime() - (opts.minAgeMs ?? DAY_MS);
  const removed: string[] = [];
  for (const prefix of monthPrefixes(now, opts.months ?? 12)) {
    const objects = await fileStore.list(prefix);
    if (objects.length === 0) continue;
    const known = new Set(
      (await prisma.file.findMany({ where: { storageKey: { startsWith: prefix } }, select: { storageKey: true } })).map(
        (f) => f.storageKey,
      ),
    );
    for (const o of objects) {
      if (known.has(o.key) || o.createdAt.getTime() > cutoff) continue;
      await fileStore.remove(o.key);
      removed.push(o.key);
    }
  }
  return removed;
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const removed = await sweepOrphanFiles();
    console.log(`files sweep: removed ${removed.length} orphaned file(s)`);
  } finally {
    await prisma.$disconnect();
  }
}
