import { pathToFileURL } from "node:url";
import { config } from "../src/config.js";
import { prisma } from "../src/db.js";

/** Deletes receipt check rows created more than `retentionDays` ago. Returns the number of rows deleted. */
export async function purgeReceiptChecks(
  opts: { retentionDays?: number; now?: Date } = {},
): Promise<number> {
  const days = opts.retentionDays ?? config.RECEIPT_RETENTION_DAYS;
  const cutoff = new Date((opts.now ?? new Date()).getTime() - days * 24 * 60 * 60 * 1000);
  const { count } = await prisma.receiptCheck.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return count;
}

// Run as a CLI only when executed directly, so tests can import the function without side effects.
const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const deleted = await purgeReceiptChecks();
    console.log(`receipt checks purged: ${deleted} (older than ${config.RECEIPT_RETENTION_DAYS} days)`);
  } finally {
    await prisma.$disconnect();
  }
}
