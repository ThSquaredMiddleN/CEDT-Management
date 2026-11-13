import type { BorrowRequest, InventoryItem, IssuedLine } from "../types";
import { RESERVATION_MS, borrowRequests, clock, inventory, reservations, syncCounts, units } from "./mockStore";

export const findItem = (itemId: string): InventoryItem | undefined => inventory.find((i) => i.id === itemId);

/** Drop expired reservations, and clear restock flags that no longer hold any units. */
export function expireReservations(): void {
  const now = clock.now();
  for (let i = reservations.length - 1; i >= 0; i--) {
    if (reservations[i].expiresAt <= now) reservations.splice(i, 1);
  }
  for (const req of borrowRequests) {
    if (req.restock && req.status === "UNFULFILLED" && !reservations.some((r) => r.requestId === req.id)) {
      delete req.restock;
    }
  }
}

/** Units of an item reserved for requests other than `exceptRequestId`. */
export function reservedByOthers(itemId: string, exceptRequestId?: string): number {
  return reservations
    .filter((r) => r.itemId === itemId && r.requestId !== exceptRequestId)
    .reduce((n, r) => n + r.qty, 0);
}

export const totalReserved = (itemId: string) => reservedByOthers(itemId);

/** Units a request (or a walk-in when no request) may take right now. */
export function issuableQty(itemId: string, requestId?: string): number {
  const item = findItem(itemId);
  if (!item) return 0;
  return Math.max(0, item.available - reservedByOthers(itemId, requestId));
}

/**
 * Sweep rule: an OPEN request becomes UNFULFILLED only when NONE of its lines
 * can be issued. A request with some sold-out lines stays OPEN so staff can
 * still hand out the rest.
 */
export function sweepRequests(): string[] {
  const swept: string[] = [];
  for (const req of borrowRequests) {
    if (req.status !== "OPEN") continue;
    if (req.items.every((it) => issuableQty(it.itemId, req.id) === 0)) {
      req.status = "UNFULFILLED";
      swept.push(req.id);
    }
  }
  return swept;
}

/**
 * Units of `itemId` came back to the shelf. Reserve them, in queue order, for
 * UNFULFILLED requests that need the item and flag those requests so the student
 * can reopen within the hold window.
 */
export function restockItem(itemId: string, qty: number): void {
  const item = findItem(itemId);
  if (!item || qty <= 0) return;
  const now = clock.now();
  let free = Math.min(qty, item.available - reservedByOthers(itemId));
  const queue = borrowRequests
    .filter((r) => r.status === "UNFULFILLED" && r.items.some((it) => it.itemId === itemId))
    .sort((a, b) => a.createdAt - b.createdAt);

  for (const req of queue) {
    if (free <= 0) break;
    const line = req.items.find((it) => it.itemId === itemId)!;
    const existing = reservations.find((r) => r.requestId === req.id && r.itemId === itemId);
    const want = line.reqQty - (existing?.qty ?? 0);
    const give = Math.min(free, want);
    if (give <= 0) continue;
    if (existing) {
      existing.qty += give;
      existing.expiresAt = now + RESERVATION_MS;
    } else {
      reservations.push({ requestId: req.id, itemId, qty: give, expiresAt: now + RESERVATION_MS });
    }
    free -= give;
    req.restock = { flaggedAt: req.restock?.flaggedAt ?? now, expiresAt: now + RESERVATION_MS };
  }
}

/** Reduce a request's reservation after units were issued against it. */
export function consumeReservation(requestId: string, itemId: string, qty: number): void {
  const idx = reservations.findIndex((r) => r.requestId === requestId && r.itemId === itemId);
  if (idx < 0) return;
  reservations[idx].qty -= qty;
  if (reservations[idx].qty <= 0) reservations.splice(idx, 1);
}

/** Throws a Thai message on the first line that cannot be issued; changes nothing. */
export function validateIssue(lines: IssuedLine[], requestId?: string): void {
  for (const line of lines) {
    const item = findItem(line.itemId);
    if (!item) throw new Error(`ไม่พบอุปกรณ์ ${line.itemId}`);
    const room = issuableQty(line.itemId, requestId);
    if (line.qty > room) throw new Error(`สต็อก ${item.name} ไม่พอ (จ่ายได้ ${room})`);
    if (item.isUnique) {
      if (line.sns.length !== line.qty) throw new Error(`ระบุ Serial ของ ${item.name} ไม่ครบ`);
      if (new Set(line.sns).size !== line.sns.length) throw new Error(`Serial ของ ${item.name} ซ้ำกัน`);
      for (const sn of line.sns) {
        const unit = units.find((u) => u.serial === sn && u.itemId === line.itemId);
        if (!unit || unit.status !== "AVAILABLE") throw new Error(`Serial ${sn} ไม่พร้อมจ่าย`);
      }
    }
  }
}

/** Apply an already-validated issue: units go OUT, bulk counts drop, reservations shrink. */
export function applyIssue(lines: IssuedLine[], requestId?: string): void {
  for (const line of lines) {
    if (line.qty <= 0) continue;
    const item = findItem(line.itemId)!;
    if (item.isUnique) {
      for (const sn of line.sns) {
        const unit = units.find((u) => u.serial === sn)!;
        unit.status = "OUT";
        unit.requestId = requestId;
      }
      syncCounts(item);
    } else {
      item.available -= line.qty;
    }
    if (requestId) consumeReservation(requestId, line.itemId, line.qty);
  }
}

export function reopenRequest(req: BorrowRequest): void {
  if (req.status !== "UNFULFILLED") throw new Error("คำขอนี้ไม่ได้อยู่ในสถานะ UNFULFILLED");
  if (!req.restock) throw new Error("คำขอนี้ยังไม่มีการแจ้งสต็อกกลับมา");
  if (req.items.every((it) => issuableQty(it.itemId, req.id) === 0)) {
    throw new Error("สต็อกหมดแล้ว หรือหมดเวลาจองอุปกรณ์");
  }
  req.status = "OPEN";
  delete req.restock; // reservations stay until issued or expired; createdAt keeps the queue place
}
