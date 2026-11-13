import type {
  BorrowRequest,
  InventoryItem,
  IssuedLine,
  NewInventoryItem,
  PendingReturnItem,
  PickupDetails,
  QCDecision,
  QCItem,
  QCItemStatus,
  QCRequest,
  QCSubmission,
  ReturnCounts,
  ReturnFine,
  Student,
} from "../types";
import {
  apiConfig,
  borrowRequests,
  clock,
  createUnits,
  inventory,
  pendingReturns,
  qcRequests,
  students,
  syncAllCounts,
  syncCounts,
  units,
} from "./mockStore";
import {
  applyIssue,
  expireReservations,
  findItem,
  issuableQty,
  reopenRequest,
  restockItem,
  sweepRequests,
  totalReserved,
  validateIssue,
} from "./stockLogic";

const delay = <T,>(value: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), apiConfig.latencyMs));

const fail = (message: string): never => {
  throw new Error(message);
};

const availableSerials = (itemId: string) =>
  units.filter((u) => u.itemId === itemId && u.status === "AVAILABLE").map((u) => u.serial);

/** UI view of an item: `available` is the general pool, reserved units shown separately. */
function itemView(item: InventoryItem): InventoryItem {
  const reserved = totalReserved(item.id);
  return {
    ...item,
    reserved,
    available: Math.max(0, item.available - reserved),
    availableSerials: item.isUnique ? availableSerials(item.id) : undefined,
  };
}

const QC_ORDER: QCDecision[] = ["AVAILABLE", "DAMAGED", "LOST"];
const worst = (r: Record<QCDecision, number>): QCItemStatus =>
  [...QC_ORDER].reverse().find((k) => r[k] > 0) ?? "AVAILABLE";

function nextQcId(): string {
  const max = qcRequests.reduce((m, r) => Math.max(m, Number(r.id.split("-").pop()) || 0), 0);
  return `REQ-R-${Math.max(max, 299) + 1}`;
}

export const storageApi = {
  getInventory: async (): Promise<InventoryItem[]> => {
    expireReservations();
    syncAllCounts();
    return delay(inventory.map(itemView));
  },

  /** Register a new equipment type; all units start as available. Unique items get serial records. */
  addInventoryItem: async (input: NewInventoryItem): Promise<InventoryItem> => {
    const id = input.id.trim().toUpperCase();
    if (inventory.some((i) => i.id === id)) return fail(`รหัสอุปกรณ์ ${id} มีอยู่แล้ว`);
    const item: InventoryItem = {
      id,
      name: input.name.trim(),
      isUnique: input.isUnique,
      available: input.total,
      reserved: 0,
      qc: 0,
      damaged: 0,
      lost: 0,
      total: input.total,
      imageUrl: input.imageUrl,
    };
    inventory.push(item);
    if (item.isUnique) {
      createUnits(id, { AVAILABLE: input.total }); // EQ-005-001 .. EQ-005-00N
      syncCounts(item);
    }
    return delay(itemView(item));
  },

  /** Mock stores the data URL in memory; a real backend would upload the file and keep its URL. */
  setItemImage: async (id: string, imageUrl: string | undefined): Promise<InventoryItem> => {
    const item = findItem(id);
    if (!item) return fail("ไม่พบอุปกรณ์");
    item!.imageUrl = imageUrl;
    return delay(itemView(item!));
  },

  getBorrowRequests: async (): Promise<BorrowRequest[]> => {
    expireReservations();
    return delay(borrowRequests);
  },

  getBorrowRequest: async (id: string): Promise<BorrowRequest> => {
    expireReservations();
    const req = borrowRequests.find((r) => r.id === id);
    if (!req) return fail("ไม่พบคำขอ");
    const decorated: BorrowRequest = {
      ...req!,
      items: req!.items.map((it) => ({
        ...it,
        available: issuableQty(it.itemId, req!.id),
        availableSerials: it.isUnique ? availableSerials(it.itemId) : undefined,
      })),
    };
    return delay(decorated);
  },

  /** Click & Collect: partial fulfilment allowed; task becomes READY_FOR_PICKUP. */
  confirmBorrow: async (
    id: string,
    lines: IssuedLine[],
    _pickup: PickupDetails,
  ): Promise<{ swept: string[] }> => {
    expireReservations();
    const req = borrowRequests.find((r) => r.id === id);
    if (!req) return fail("ไม่พบคำขอ");
    if (req!.status !== "OPEN") return fail("คำขอนี้ไม่ได้อยู่ในสถานะ OPEN");
    const issued = lines.filter((l) => l.qty > 0);
    if (issued.length === 0) return fail("ยังไม่ได้จ่ายอุปกรณ์ชิ้นใดเลย");
    validateIssue(issued, id);
    applyIssue(issued, id);
    for (const l of issued) {
      const it = req!.items.find((i) => i.itemId === l.itemId);
      if (it) it.issuedQty = l.qty;
    }
    req!.status = "READY_FOR_PICKUP";
    return delay({ swept: sweepRequests() });
  },

  /** Student reopens a request flagged "stock is back"; it keeps its original queue position. */
  reopenBorrow: async (id: string): Promise<BorrowRequest> => {
    expireReservations();
    const req = borrowRequests.find((r) => r.id === id);
    if (!req) return fail("ไม่พบคำขอ");
    reopenRequest(req!);
    return delay(req!);
  },

  lookupStudent: (studentId: string): Promise<Student> => {
    const s = students.find((x) => x.studentId === studentId.trim());
    return s ? delay(s) : Promise.reject(new Error("ไม่พบรหัสนิสิตนี้"));
  },

  /** Walk-in POS checkout: takes from the general pool (reserved units are off limits). */
  walkInCheckout: async (_studentId: string, _groupId: string, lines: IssuedLine[]) => {
    expireReservations();
    if (lines.length === 0) return fail("ตะกร้าว่าง");
    validateIssue(lines);
    applyIssue(lines);
    return delay({ swept: sweepRequests() });
  },

  /** Overdue ("not brought") items first. */
  getPendingReturns: (studentId: string): Promise<PendingReturnItem[]> =>
    delay(
      [...(pendingReturns[studentId] ?? [])].sort(
        (a, b) => Number(b.owedStatus === "NOT_BROUGHT") - Number(a.owedStatus === "NOT_BROUGHT"),
      ),
    ),

  /**
   * Face-to-face return. Each owed line is split by counts that must add up to its qty:
   * RETURNED -> goes to QC; NOT_BROUGHT -> stays owed (overdue); LOST (only for lines
   * already overdue) -> counted lost and a fine task is opened. A partly returned bulk
   * line keeps only its not-brought remainder owed.
   */
  submitReturn: async (
    studentId: string,
    results: Record<string, ReturnCounts>,
    _remark: string,
    fine?: ReturnFine,
  ): Promise<{ queued: number; lost: number }> => {
    const owed = pendingReturns[studentId] ?? [];
    const plan = owed.map((i) => {
      const r = results[i.id];
      if (!r) return fail("ยังระบุสถานะไม่ครบทุกรายการ");
      const counts = [r.RETURNED, r.NOT_BROUGHT, r.LOST];
      if (counts.some((n) => !Number.isInteger(n) || n < 0)) return fail("จำนวนไม่ถูกต้อง");
      if (counts.reduce((a, b) => a + b, 0) !== i.qty) return fail(`จำนวนของ ${i.name} ต้องรวมได้ ${i.qty} ชิ้น`);
      if (r.LOST > 0 && i.owedStatus !== "NOT_BROUGHT") {
        return fail("ระบุสูญหายได้เฉพาะรายการที่ค้างส่ง (ไม่ได้นำมา) แล้ว");
      }
      return { i, r };
    });
    const lostLines = plan.filter(({ r }) => r.LOST > 0);
    if (lostLines.length > 0 && !(fine && fine.amount > 0)) return fail("กรุณาระบุยอดค่าปรับ");
    for (const { i, r } of plan) {
      if (i.isUnique && (r.RETURNED > 0 || r.LOST > 0)) {
        const unit = units.find((u) => u.serial === i.serialNumber && u.itemId === i.itemId);
        if (!unit || unit.status !== "OUT") return fail(`Serial ${i.serialNumber} ไม่อยู่ในสถานะที่ยืมออกไป`);
      }
    }

    const move = (i: PendingReturnItem, qty: number, to: "QC" | "LOST") => {
      const item = findItem(i.itemId)!;
      if (i.isUnique) {
        units.find((u) => u.serial === i.serialNumber)!.status = to;
        syncCounts(item);
      } else if (to === "QC") item.qc += qty;
      else item.lost += qty;
    };
    const received: QCItem[] = [];
    const lost: QCItem[] = [];
    const toQcItem = (i: PendingReturnItem, qty: number, status: QCItemStatus, id: string): QCItem => ({
      id, itemId: i.itemId, name: i.name, isUnique: i.isUnique, qty, serialNumber: i.serialNumber, status,
      ...(status === "LOST" ? { results: { AVAILABLE: 0, DAMAGED: 0, LOST: qty } } : {}),
    });
    for (const { i, r } of plan) {
      if (r.RETURNED > 0) {
        move(i, r.RETURNED, "QC");
        received.push(toQcItem(i, r.RETURNED, "PENDING_TEST", i.id));
      }
      if (r.LOST > 0) {
        move(i, r.LOST, "LOST");
        lost.push(toQcItem(i, r.LOST, "LOST", `${i.id}-L`));
      }
    }

    const student = students.find((s) => s.studentId === studentId);
    const base = { type: "Face-to-Face Return", group: student?.groups[0]?.label ?? "-", user: student?.name ?? studentId };
    if (received.length > 0) {
      qcRequests.unshift({ id: nextQcId(), ...base, status: "OPEN", fineAmount: 0, fineRemark: "", items: received });
    }
    if (lost.length > 0) {
      qcRequests.unshift({
        id: nextQcId(), ...base, status: "PENDING_PAYMENT", fineAmount: fine!.amount, fineRemark: fine!.remark, items: lost,
      });
    }

    const now = clock.now();
    pendingReturns[studentId] = plan
      .filter(({ r }) => r.NOT_BROUGHT > 0)
      .map(({ i, r }) => ({ ...i, qty: r.NOT_BROUGHT, owedStatus: "NOT_BROUGHT" as const, notBroughtAt: i.notBroughtAt ?? now }));
    return delay({
      queued: received.reduce((n, q) => n + q.qty, 0),
      lost: lost.reduce((n, q) => n + q.qty, 0),
    });
  },

  getQCRequests: async (): Promise<QCRequest[]> => delay(qcRequests),

  getQCRequest: (id: string): Promise<QCRequest> => {
    const r = qcRequests.find((x) => x.id === id);
    return r ? delay(r) : Promise.reject(new Error("ไม่พบรายการ QC"));
  },

  /**
   * Each item's results (available/damaged/lost counts) must add up to its qty, so a bulk
   * batch can be split. Any damaged/lost needs a fine -> PENDING_PAYMENT; otherwise CLOSED.
   * Units that pass QC are restocked, which flags and reserves for waiting requests.
   */
  submitQC: async (id: string, sub: QCSubmission): Promise<{ status: QCRequest["status"] }> => {
    const req = qcRequests.find((r) => r.id === id);
    if (!req) return fail("ไม่พบรายการ QC");
    if (req!.status !== "OPEN") return fail("รายการนี้ถูกตรวจแล้ว");

    const pending = req!.items.filter((i) => i.status === "PENDING_TEST");
    const plan = pending.map((it) => {
      const entry = sub.items.find((s) => s.id === it.id);
      if (!entry) return fail("ยังระบุผลตรวจไม่ครบทุกรายการ");
      const r = entry!.results;
      const counts = QC_ORDER.map((k) => r[k]);
      if (counts.some((n) => !Number.isInteger(n) || n < 0)) return fail("จำนวนผลตรวจไม่ถูกต้อง");
      if (counts.reduce((a, b) => a + b, 0) !== it.qty) return fail(`ผลตรวจของ ${it.name} ต้องรวมได้ ${it.qty} ชิ้น`);
      return { it, r };
    });

    const hasLiability = plan.some(({ r }) => r.DAMAGED > 0 || r.LOST > 0);
    if (hasLiability && !(sub.fineAmount > 0)) return fail("กรุณาระบุยอดค่าปรับ");

    for (const { it } of plan) {
      const item = findItem(it.itemId);
      if (it.isUnique) {
        const unit = units.find((u) => u.serial === it.serialNumber && u.itemId === it.itemId);
        if (!unit || unit.status !== "QC") return fail(`Serial ${it.serialNumber} ไม่ได้อยู่ในคิว QC`);
      } else if (item && item.qc < it.qty) {
        return fail(`ยอด QC ของ ${item.name} ไม่ตรงกับรายการ`);
      }
    }

    const restocked = new Map<string, number>();
    for (const { it, r } of plan) {
      const item = findItem(it.itemId);
      if (item) {
        if (it.isUnique) {
          units.find((u) => u.serial === it.serialNumber)!.status = r.LOST ? "LOST" : r.DAMAGED ? "DAMAGED" : "AVAILABLE";
          syncCounts(item);
        } else {
          item.qc -= it.qty;
          item.available += r.AVAILABLE;
          item.damaged += r.DAMAGED;
          item.lost += r.LOST;
        }
        if (r.AVAILABLE > 0) restocked.set(it.itemId, (restocked.get(it.itemId) ?? 0) + r.AVAILABLE);
      }
      it.results = { ...r };
      it.status = worst(r);
    }
    for (const [itemId, qty] of restocked) restockItem(itemId, qty);

    req!.fineAmount = hasLiability ? sub.fineAmount : 0;
    req!.fineRemark = hasLiability ? sub.fineRemark : "";
    req!.status = hasLiability ? "PENDING_PAYMENT" : "CLOSED";
    return delay({ status: req!.status });
  },

  /** Slip verification: only a valid slip may close a PENDING_PAYMENT task. */
  verifySlip: async (id: string, valid: boolean): Promise<{ status: QCRequest["status"] }> => {
    const req = qcRequests.find((r) => r.id === id);
    if (!req) return fail("ไม่พบรายการ QC");
    if (req!.status !== "PENDING_PAYMENT") return fail("รายการนี้ไม่ได้รอชำระเงิน");
    if (valid) req!.status = "CLOSED";
    return delay({ status: req!.status });
  },
};
