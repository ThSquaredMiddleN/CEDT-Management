import type { StorageItem } from "@prisma/client";
import { audit } from "../../core/audit.js";
import type { Tx } from "../../db.js";
import { conflict, notFound, validation } from "../../lib/errors.js";
import { notifyRequest } from "./access.js";

/** Restocked units stay held for a flagged request this long. */
export const RESERVATION_MS = 24 * 60 * 60 * 1000;

/** One line handed out: item code, count, and the serials for unique items. */
export interface IssueLine {
  itemId: string;
  qty: number;
  sns: string[];
}

export async function itemByCode(tx: Tx, code: string): Promise<StorageItem> {
  const item = await tx.storageItem.findUnique({ where: { code } });
  if (!item) throw notFound(`ไม่พบอุปกรณ์ ${code}`);
  return item;
}

/** Physical units on the shelf (holds not subtracted). */
export async function shelfQty(tx: Tx, itemId: string): Promise<number> {
  const item = await tx.storageItem.findUniqueOrThrow({ where: { id: itemId } });
  return item.isUnique ? tx.storageUnit.count({ where: { itemId, status: "available" } }) : item.bulkAvailable;
}

export async function itemTotal(tx: Tx, item: StorageItem): Promise<number> {
  return item.isUnique ? tx.storageUnit.count({ where: { itemId: item.id } }) : item.bulkTotal;
}

export async function availableSerialsOf(tx: Tx, itemId: string): Promise<string[]> {
  const units = await tx.storageUnit.findMany({ where: { itemId, status: "available" }, orderBy: { serial: "asc" }, select: { serial: true } });
  return units.map((u) => u.serial);
}

/** Units of an item held for requests other than `exceptRequestId`. */
export async function reservedByOthers(tx: Tx, itemId: string, exceptRequestId?: string): Promise<number> {
  const agg = await tx.storageReservation.aggregate({
    where: { itemId, ...(exceptRequestId ? { requestId: { not: exceptRequestId } } : {}) },
    _sum: { qty: true },
  });
  return agg._sum.qty ?? 0;
}

/** Units a request (or a walk-in, when no request) may take right now. */
export async function issuableQty(tx: Tx, itemId: string, requestId?: string): Promise<number> {
  return Math.max(0, (await shelfQty(tx, itemId)) - (await reservedByOthers(tx, itemId, requestId)));
}

/**
 * Sweep rule: an OPEN request becomes UNFULFILLED only when none of its lines can be issued. A request
 * with some sold-out lines stays OPEN so staff can still hand out the rest. Returns the swept request numbers.
 */
export async function sweep(tx: Tx): Promise<string[]> {
  const open = await tx.storageRequest.findMany({ where: { status: "open" }, include: { lines: true }, orderBy: [{ createdAt: "asc" }, { requestNo: "asc" }] });
  const swept: string[] = [];
  for (const req of open) {
    let issuable = false;
    for (const line of req.lines) {
      if ((await issuableQty(tx, line.itemId, req.id)) > 0) {
        issuable = true;
        break;
      }
    }
    if (!issuable) {
      await tx.storageRequest.update({ where: { id: req.id }, data: { status: "unfulfilled" } });
      swept.push(req.requestNo);
    }
  }
  return swept;
}

/**
 * `qty` units of the item came back to the shelf. Hold them, in queue order, for UNFULFILLED requests that
 * need the item, and flag those requests so a member can reopen within the hold window.
 */
export async function restockItem(tx: Tx, itemId: string, qty: number, now: Date): Promise<void> {
  if (qty <= 0) return;
  let free = Math.min(qty, (await shelfQty(tx, itemId)) - (await reservedByOthers(tx, itemId)));
  const expiresAt = new Date(now.getTime() + RESERVATION_MS);
  const queue = await tx.storageRequest.findMany({
    where: { status: "unfulfilled", lines: { some: { itemId } } },
    include: { lines: true },
    orderBy: [{ createdAt: "asc" }, { requestNo: "asc" }],
  });
  for (const req of queue) {
    if (free <= 0) break;
    const line = req.lines.find((l) => l.itemId === itemId)!;
    const key = { requestId_itemId: { requestId: req.id, itemId } };
    const existing = await tx.storageReservation.findUnique({ where: key });
    const give = Math.min(free, line.reqQty - (existing?.qty ?? 0));
    if (give <= 0) continue;
    await tx.storageReservation.upsert({
      where: key,
      create: { requestId: req.id, itemId, qty: give, expiresAt },
      update: { qty: { increment: give }, expiresAt },
    });
    free -= give;
    const flagged = await tx.storageRequest.update({
      where: { id: req.id },
      data: { restockFlaggedAt: req.restockFlaggedAt ?? now, restockExpiresAt: expiresAt },
    });
    if (!req.restockFlaggedAt) {
      await notifyRequest(tx, flagged, "storage.restock", `อุปกรณ์ในคำขอ ${req.requestNo} มีของแล้ว เปิดคำขอใหม่ภายใน 24 ชั่วโมง`);
    }
  }
}

/** Drop a request's holds and offer the units to the queue. The caller has already moved it out of UNFULFILLED. */
export async function releaseHolds(tx: Tx, requestId: string, now: Date): Promise<void> {
  const held = await tx.storageReservation.findMany({ where: { requestId } });
  await tx.storageReservation.deleteMany({ where: { requestId } });
  for (const r of held) await restockItem(tx, r.itemId, r.qty, now);
}

/**
 * Expired holds go back to the pool. A flagged request whose window has passed is cancelled
 * (restock_expired); a flag that no longer holds any units is cleared.
 */
export async function expireHolds(tx: Tx, now: Date): Promise<void> {
  await tx.storageReservation.deleteMany({ where: { expiresAt: { lte: now } } });
  const flagged = await tx.storageRequest.findMany({ where: { status: "unfulfilled", restockExpiresAt: { not: null } } });
  for (const req of flagged) {
    if (req.restockExpiresAt! <= now) {
      const cancelled = await tx.storageRequest.update({
        where: { id: req.id },
        data: { status: "cancelled", cancelReason: "restock_expired", restockFlaggedAt: null, restockExpiresAt: null },
      });
      await audit(tx, {
        actorId: null,
        action: "storage.request.expired",
        subjectType: "storage_request",
        subjectId: req.id,
        before: { status: "unfulfilled" },
        after: { status: "cancelled", cancelReason: "restock_expired" },
      });
      await releaseHolds(tx, req.id, now);
      await notifyRequest(tx, cancelled, "storage.hold_expired", `คำขอ ${req.requestNo} ถูกยกเลิก เพราะไม่ได้เปิดคำขอใหม่ภายในเวลาที่จองไว้`);
    } else if ((await tx.storageReservation.count({ where: { requestId: req.id } })) === 0) {
      await tx.storageRequest.update({ where: { id: req.id }, data: { restockFlaggedAt: null, restockExpiresAt: null } });
    }
  }
}

/** Throws a Thai message on the first line that cannot be issued; changes nothing. Returns items by code. */
export async function validateIssue(tx: Tx, lines: IssueLine[], requestId?: string): Promise<Map<string, StorageItem>> {
  if (new Set(lines.map((l) => l.itemId)).size !== lines.length) throw validation("รายการอุปกรณ์ซ้ำกัน");
  const items = new Map<string, StorageItem>();
  for (const line of lines) {
    const item = await itemByCode(tx, line.itemId);
    items.set(line.itemId, item);
    const room = await issuableQty(tx, item.id, requestId);
    if (line.qty > room) throw conflict(`สต็อก ${item.name} ไม่พอ (จ่ายได้ ${room})`);
    if (item.isUnique) {
      if (line.sns.length !== line.qty) throw validation(`ระบุ Serial ของ ${item.name} ไม่ครบ`);
      if (new Set(line.sns).size !== line.sns.length) throw validation(`Serial ของ ${item.name} ซ้ำกัน`);
      for (const sn of line.sns) {
        const unit = await tx.storageUnit.findUnique({ where: { serial: sn } });
        if (!unit || unit.itemId !== item.id || unit.status !== "available") throw conflict(`Serial ${sn} ไม่พร้อมจ่าย`);
      }
    }
  }
  return items;
}

/** Apply an already-validated issue: units go out, bulk counts drop, the request's holds shrink. */
export async function applyIssue(tx: Tx, lines: IssueLine[], items: Map<string, StorageItem>, requestId: string): Promise<void> {
  for (const line of lines) {
    if (line.qty <= 0) continue;
    const item = items.get(line.itemId)!;
    if (item.isUnique) {
      await tx.storageUnit.updateMany({ where: { serial: { in: line.sns } }, data: { status: "out", requestId } });
    } else {
      await tx.storageItem.update({ where: { id: item.id }, data: { bulkAvailable: { decrement: line.qty } } });
    }
    const hold = await tx.storageReservation.findUnique({ where: { requestId_itemId: { requestId, itemId: item.id } } });
    if (hold) {
      if (hold.qty <= line.qty) await tx.storageReservation.delete({ where: { id: hold.id } });
      else await tx.storageReservation.update({ where: { id: hold.id }, data: { qty: hold.qty - line.qty } });
    }
  }
}

/** After pickup (or a walk-in): every issued unit, and every issued bulk line, becomes owed by the request's owners. */
export async function createOwed(tx: Tx, requestId: string, now: Date): Promise<void> {
  const req = await tx.storageRequest.findUniqueOrThrow({ where: { id: requestId }, include: { lines: { include: { item: true } } } });
  for (const line of req.lines) {
    if (line.issuedQty <= 0) continue;
    if (line.item.isUnique) {
      const units = await tx.storageUnit.findMany({ where: { requestId, itemId: line.itemId, status: "out" }, orderBy: { serial: "asc" } });
      if (units.length) {
        await tx.storageOwedItem.createMany({ data: units.map((u) => ({ requestId, itemId: line.itemId, serial: u.serial, qty: 1, createdAt: now })) });
      }
    } else {
      await tx.storageOwedItem.create({ data: { requestId, itemId: line.itemId, qty: line.issuedQty, createdAt: now } });
    }
  }
}
