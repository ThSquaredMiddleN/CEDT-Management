import { prisma, type Tx } from "../../db.js";
import { expireHolds } from "./stock.js";

/** The storage clock. Tests replace `now` to move time (24 h restock holds). */
export const clock = { now: (): Date => new Date() };

/**
 * Every storage operation runs here, reads included. It is one transaction, serialised with every other
 * storage transaction by a transaction-level advisory lock: traffic is tiny, and the restock queue touches
 * requests for other items, which row locks would miss. Expired holds are settled first, so no caller
 * sees a stale hold.
 * Reads also queue behind the lock and hold a pool connection while waiting; fine at current traffic.
 */
export async function storageTx<T>(fn: (tx: Tx, now: Date) => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('storage'))`;
      const now = clock.now();
      await expireHolds(tx, now);
      return fn(tx, now);
    },
    { timeout: 15_000, maxWait: 15_000 },
  );
}
