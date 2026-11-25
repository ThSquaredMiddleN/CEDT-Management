import { loadSessionUser } from "../../src/core/permissions.js";
import { prisma } from "../../src/db.js";
import { seedStorage } from "../../prisma/seed-storage.js";
import { clock } from "../../src/modules/storage/tx.js";
import { listItems } from "../../src/modules/storage/inventory.js";
import { getQc, submitQc } from "../../src/modules/storage/qc.js";
import { walkIn } from "../../src/modules/storage/requests.js";
import type { IssueLine } from "../../src/modules/storage/stock.js";
import { idOf } from "../helpers/session.js";

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;
export const ok = { AVAILABLE: 1, DAMAGED: 0, LOST: 0 };
export const pickup = { pickupAt: "2026-11-14T10:00:00+07:00", location: "counter" as const, remark: "" };

/** Fresh storage data and real time before every test. */
export async function resetStorage(): Promise<void> {
  clock.now = () => new Date();
  await seedStorage(prisma);
}

export async function actor(email: string) {
  const user = await loadSessionUser(await idOf(prisma, email));
  if (!user) throw new Error(`no active user ${email}`);
  return user;
}
export const staffId = () => idOf(prisma, "storekeeper@test.local");

export const pis = (n: number): IssueLine => ({
  itemId: "EQ-001",
  qty: n,
  sns: Array.from({ length: n }, (_, i) => `EQ-001-${String(i + 1).padStart(3, "0")}`),
});
export const bulk = (itemId: string, qty: number): IssueLine => ({ itemId, qty, sns: [] });
export const rc = (RETURNED: number, NOT_BROUGHT: number, LOST: number) => ({ RETURNED, NOT_BROUGHT, LOST });

/** Walk-in to a student with no account and no group: takes stock from the general pool. */
export async function walk(lines: IssueLine[]) {
  return walkIn(await staffId(), { studentId: "6800000009", groupId: "personal", lines });
}
export const inv = async (code: string) => (await listItems()).find((i) => i.id === code)!;

/** Pis and breadboards sold out, so REQ-B-101 (needs both) is swept; REQ-B-103 keeps its servos. */
export async function sellOutB101() {
  await walk([pis(5)]);
  await walk([bulk("EQ-002", 42)]);
}

/** QC task item ids by serial (unique) or item code (bulk). */
export async function qcIds(taskNo: string): Promise<Record<string, string>> {
  return Object.fromEntries((await getQc(taskNo)).items.map((i) => [i.serialNumber ?? i.itemId, i.id]));
}

/** Sell out, then pass REQ-R-201 (2 Pis + 5 breadboards) so REQ-B-101 is flagged and held. */
export async function restock() {
  await sellOutB101();
  const ids = await qcIds("REQ-R-201");
  await submitQc(await staffId(), "REQ-R-201", {
    items: [
      { id: ids["EQ-001-006"]!, results: ok },
      { id: ids["EQ-001-007"]!, results: ok },
      { id: ids["EQ-002"]!, results: { AVAILABLE: 5, DAMAGED: 0, LOST: 0 } },
    ],
    fineAmount: 0,
    fineRemark: "",
  });
}
