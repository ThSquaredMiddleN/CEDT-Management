import type { StorageItem } from "@prisma/client";
import { audit } from "../../core/audit.js";
import type { Tx } from "../../db.js";
import { conflict } from "../../lib/errors.js";
import { availableSerialsOf, reservedByOthers } from "./stock.js";
import { storageTx } from "./tx.js";
import type { CatalogItemView, InventoryItemView } from "./views.js";

async function counts(tx: Tx, item: StorageItem) {
  if (!item.isUnique) {
    return { shelf: item.bulkAvailable, qc: item.bulkQc, damaged: item.bulkDamaged, lost: item.bulkLost, total: item.bulkTotal };
  }
  const rows = await tx.storageUnit.groupBy({ by: ["status"], where: { itemId: item.id }, _count: { _all: true } });
  const n = (s: string) => rows.find((r) => r.status === s)?._count._all ?? 0;
  return { shelf: n("available"), qc: n("qc"), damaged: n("damaged"), lost: n("lost"), total: rows.reduce((a, r) => a + r._count._all, 0) };
}

/** Staff view: `available` is the general pool (shelf minus every hold); holds shown as `reserved`. */
export async function itemView(tx: Tx, item: StorageItem): Promise<InventoryItemView> {
  const c = await counts(tx, item);
  const reserved = await reservedByOthers(tx, item.id);
  return {
    id: item.code,
    name: item.name,
    isUnique: item.isUnique,
    available: Math.max(0, c.shelf - reserved),
    reserved,
    qc: c.qc,
    damaged: c.damaged,
    lost: c.lost,
    total: c.total,
    availableSerials: item.isUnique ? await availableSerialsOf(tx, item.id) : undefined,
  };
}

export const listItems = () =>
  storageTx(async (tx) => {
    const items = await tx.storageItem.findMany({ orderBy: { code: "asc" } });
    const views: InventoryItemView[] = [];
    for (const item of items) views.push(await itemView(tx, item));
    return views;
  });

/** Student view: only what the cart needs (spec decision 5). */
export const listCatalog = async (): Promise<CatalogItemView[]> =>
  (await listItems()).map(({ id, name, isUnique, available, total }) => ({ id, name, isUnique, available, total }));

export function addItem(actorId: string, input: { id: string; name: string; isUnique: boolean; total: number }) {
  return storageTx(async (tx) => {
    const code = input.id.trim().toUpperCase();
    if (await tx.storageItem.findUnique({ where: { code } })) throw conflict(`รหัสอุปกรณ์ ${code} มีอยู่แล้ว`);
    const item = await tx.storageItem.create({
      data: input.isUnique
        ? { code, name: input.name.trim(), isUnique: true }
        : { code, name: input.name.trim(), isUnique: false, bulkAvailable: input.total, bulkTotal: input.total },
    });
    if (input.isUnique) {
      await tx.storageUnit.createMany({
        data: Array.from({ length: input.total }, (_, i) => ({ serial: `${code}-${String(i + 1).padStart(3, "0")}`, itemId: item.id })),
      });
    }
    await audit(tx, { actorId, action: "storage.item.created", subjectType: "storage_item", subjectId: item.id, after: { code, total: input.total, isUnique: input.isUnique } });
    return itemView(tx, item);
  });
}
