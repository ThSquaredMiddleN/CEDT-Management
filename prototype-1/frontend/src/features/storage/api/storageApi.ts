import type {
  BorrowRequest,
  InventoryItem,
  IssuedLine,
  NewInventoryItem,
  PendingReturnItem,
  PickupDetails,
  QCRequest,
  QCSubmission,
  ReturnDecision,
  Student,
} from "../types";
import { borrowRequests, inventory, pendingReturns, qcRequests, students } from "./mockStore";

const delay = <T,>(value: T, ms = 150): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), ms));

const fail = (message: string): never => {
  throw new Error(message);
};

/**
 * Auto-sweep: once an item's stock hits 0, every still-OPEN request that needs
 * it can no longer be fulfilled and is flipped to UNFULFILLED.
 */
function autoSweep(): string[] {
  const soldOut = new Set(inventory.filter((i) => i.available === 0).map((i) => i.id));
  const swept: string[] = [];
  for (const req of borrowRequests) {
    if (req.status === "OPEN" && req.items.some((it) => soldOut.has(it.itemId))) {
      req.status = "UNFULFILLED";
      swept.push(req.id);
    }
  }
  return swept;
}

function deductStock(lines: IssuedLine[]) {
  for (const line of lines) {
    const item = inventory.find((i) => i.id === line.itemId);
    if (!item) fail(`ไม่พบอุปกรณ์ ${line.itemId}`);
    if (line.qty > item!.available) fail(`สต็อก ${item!.name} ไม่พอ (เหลือ ${item!.available})`);
  }
  for (const line of lines) {
    inventory.find((i) => i.id === line.itemId)!.available -= line.qty;
  }
}

export const storageApi = {
  getInventory: (): Promise<InventoryItem[]> => delay(inventory),

  /** Register a new equipment type; all units start as available. */
  addInventoryItem: async (input: NewInventoryItem): Promise<InventoryItem> => {
    const id = input.id.trim().toUpperCase();
    if (inventory.some((i) => i.id === id)) return fail(`รหัสอุปกรณ์ ${id} มีอยู่แล้ว`);
    const item: InventoryItem = {
      id,
      name: input.name.trim(),
      isUnique: input.isUnique,
      available: input.total,
      qc: 0,
      damaged: 0,
      lost: 0,
      total: input.total,
      imageUrl: input.imageUrl,
    };
    inventory.push(item);
    return delay(item);
  },

  /** Mock stores the data URL in memory; a real backend would upload the file and keep its URL. */
  setItemImage: async (id: string, imageUrl: string | undefined): Promise<InventoryItem> => {
    const item = inventory.find((i) => i.id === id);
    if (!item) return fail("ไม่พบอุปกรณ์");
    item!.imageUrl = imageUrl;
    return delay(item!);
  },

  getBorrowRequests: (): Promise<BorrowRequest[]> => delay(borrowRequests),

  getBorrowRequest: (id: string): Promise<BorrowRequest> => {
    const req = borrowRequests.find((r) => r.id === id);
    return req ? delay(req) : Promise.reject(new Error("ไม่พบคำขอ"));
  },

  /** Click & Collect: partial fulfilment allowed; task becomes READY_FOR_PICKUP. */
  confirmBorrow: async (
    id: string,
    lines: IssuedLine[],
    _pickup: PickupDetails,
  ): Promise<{ swept: string[] }> => {
    const req = borrowRequests.find((r) => r.id === id);
    if (!req) return fail("ไม่พบคำขอ");
    if (req.status !== "OPEN") return fail("คำขอนี้ไม่ได้อยู่ในสถานะ OPEN");
    if (lines.every((l) => l.qty === 0)) return fail("ยังไม่ได้จ่ายอุปกรณ์ชิ้นใดเลย");
    const issued = lines.filter((l) => l.qty > 0);
    deductStock(issued);
    for (const l of issued) {
      const it = req!.items.find((i) => i.itemId === l.itemId);
      if (it) it.issuedQty = l.qty;
    }
    req!.status = "READY_FOR_PICKUP";
    return delay({ swept: autoSweep() });
  },

  lookupStudent: (studentId: string): Promise<Student> => {
    const s = students.find((x) => x.studentId === studentId.trim());
    return s ? delay(s) : Promise.reject(new Error("ไม่พบรหัสนิสิตนี้"));
  },

  /** Walk-in POS checkout: deduct straight from stock. */
  walkInCheckout: async (_studentId: string, _groupId: string, lines: IssuedLine[]) => {
    if (lines.length === 0) return fail("ตะกร้าว่าง");
    deductStock(lines);
    return delay({ swept: autoSweep() });
  },

  getPendingReturns: (studentId: string): Promise<PendingReturnItem[]> =>
    delay(pendingReturns[studentId] ?? []),

  /** Face-to-face return: received items become PENDING_TEST and join the QC queue. */
  submitReturn: async (
    studentId: string,
    decisions: Record<string, ReturnDecision>,
    _remark: string,
  ): Promise<{ queued: number }> => {
    const owed = pendingReturns[studentId] ?? [];
    const received = owed.filter((i) => decisions[i.id] === "RETURNED");
    if (owed.some((i) => !decisions[i.id])) return fail("ยังระบุสถานะไม่ครบทุกรายการ");
    const student = students.find((s) => s.studentId === studentId);
    if (received.length > 0) {
      qcRequests.unshift({
        id: `REQ-R-${300 + qcRequests.length}`,
        type: "Face-to-Face Return",
        group: student?.groups[0]?.label ?? "-",
        user: student?.name ?? studentId,
        status: "OPEN",
        fineAmount: 0,
        fineRemark: "",
        items: received.map((i) => ({ ...i, status: "PENDING_TEST" as const })),
      });
      // Received units leave "out with student" and wait in the QC bucket.
      for (const i of received) {
        const stock = inventory.find((s) => s.id === i.itemId);
        if (stock) stock.qc += i.qty;
      }
    }
    pendingReturns[studentId] = [];
    return delay({ queued: received.length });
  },

  getQCRequests: (): Promise<QCRequest[]> => delay(qcRequests),

  getQCRequest: (id: string): Promise<QCRequest> => {
    const r = qcRequests.find((x) => x.id === id);
    return r ? delay(r) : Promise.reject(new Error("ไม่พบรายการ QC"));
  },

  /** Any DAMAGED/LOST -> PENDING_PAYMENT (needs fine); otherwise CLOSED. */
  submitQC: async (id: string, sub: QCSubmission): Promise<{ status: QCRequest["status"] }> => {
    const req = qcRequests.find((r) => r.id === id);
    if (!req) return fail("ไม่พบรายการ QC");
    if (req!.status !== "OPEN") return fail("รายการนี้ถูกตรวจแล้ว");
    const hasLiability = sub.items.some((i) => i.status === "DAMAGED" || i.status === "LOST");
    if (hasLiability && !(sub.fineAmount > 0)) return fail("กรุณาระบุยอดค่าปรับ");
    // Validate first so a bad submission never leaves stock half-updated.
    const moves = sub.items.flatMap((s) => {
      const it = req!.items.find((i) => i.id === s.id);
      return it && it.status === "PENDING_TEST" ? [{ it, to: s.status }] : [];
    });
    if (moves.length !== req!.items.filter((i) => i.status === "PENDING_TEST").length) {
      return fail("ยังระบุผลตรวจไม่ครบทุกรายการ");
    }
    const bucket = { AVAILABLE: "available", DAMAGED: "damaged", LOST: "lost" } as const;
    for (const { it } of moves) {
      const stock = inventory.find((s) => s.id === it.itemId);
      if (stock && stock.qc < it.qty) return fail(`ยอด QC ของ ${stock.name} ไม่ตรงกับรายการ`);
    }
    for (const { it, to } of moves) {
      const stock = inventory.find((s) => s.id === it.itemId);
      if (stock) {
        stock.qc -= it.qty;
        stock[bucket[to]] += it.qty;
      }
      it.status = to;
    }
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
