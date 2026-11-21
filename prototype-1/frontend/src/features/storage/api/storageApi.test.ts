import { beforeEach, describe, expect, it } from "vitest";
import { apiConfig, clock, resetMockStore, units } from "./mockStore";
import { storageApi } from "./storageApi";
import type { IssuedLine, QCResults } from "../types";

const HOUR = 60 * 60 * 1000;
const ok: QCResults = { AVAILABLE: 1, DAMAGED: 0, LOST: 0 };

beforeEach(() => {
  apiConfig.latencyMs = 0;
  resetMockStore();
});

const inv = async (id: string) => (await storageApi.getInventory()).find((i) => i.id === id)!;
const pis = (n: number): IssuedLine => ({
  itemId: "EQ-001",
  qty: n,
  sns: Array.from({ length: n }, (_, i) => `EQ-001-${String(i + 1).padStart(3, "0")}`),
});
const bulk = (itemId: string, qty: number): IssuedLine => ({ itemId, qty, sns: [] });
const rc = (RETURNED: number, NOT_BROUGHT: number, LOST: number) => ({ RETURNED, NOT_BROUGHT, LOST });
const pickup = { pickupAt: "2026-11-14T10:00", location: "counter" as const, remark: "" };

/** Pis sold out and breadboards sold out -> REQ-B-101 (needs both) is swept; REQ-B-103 keeps servos. */
async function sellOutB101() {
  await storageApi.walkInCheckout("x", "g", [pis(5)]);
  await storageApi.walkInCheckout("x", "g", [bulk("EQ-002", 42)]);
}

async function restock() {
  await sellOutB101();
  await storageApi.submitQC("REQ-R-201", {
    items: [
      { id: "q1", results: ok },
      { id: "q2", results: ok },
      { id: "q3", results: { AVAILABLE: 5, DAMAGED: 0, LOST: 0 } },
    ],
    fineAmount: 0,
    fineRemark: "",
  });
}

describe("unit records", () => {
  it("generates numbered serials for a new Unique item", async () => {
    await storageApi.addInventoryItem({ id: "eq-005", name: "Arduino", isUnique: true, total: 3 });
    const item = await inv("EQ-005");
    expect(item.availableSerials).toEqual(["EQ-005-001", "EQ-005-002", "EQ-005-003"]);
    expect(item.total).toBe(3);
  });

  it("hands out real units and rejects unavailable serials", async () => {
    await expect(storageApi.walkInCheckout("x", "g", [{ itemId: "EQ-001", qty: 1, sns: ["EQ-001-009"] }])).rejects.toThrow(
      /ไม่พร้อมจ่าย/,
    );
    await storageApi.walkInCheckout("x", "g", [pis(2)]);
    const item = await inv("EQ-001");
    expect(item.available).toBe(3);
    expect(units.find((u) => u.serial === "EQ-001-001")!.status).toBe("OUT");
  });
});

describe("sweep rule", () => {
  it("keeps a request OPEN while any line is still issuable", async () => {
    await storageApi.walkInCheckout("x", "g", [pis(5)]);
    const list = await storageApi.getBorrowRequests();
    expect(list.find((r) => r.id === "REQ-B-103")!.status).toBe("OPEN"); // servos remain
    expect(list.find((r) => r.id === "REQ-B-101")!.status).toBe("OPEN"); // breadboards remain
  });

  it("marks a request UNFULFILLED only when no line is issuable", async () => {
    await sellOutB101();
    const list = await storageApi.getBorrowRequests();
    expect(list.find((r) => r.id === "REQ-B-101")!.status).toBe("UNFULFILLED");
    expect(list.find((r) => r.id === "REQ-B-103")!.status).toBe("OPEN");
  });
});

describe("restock flag and reservation", () => {
  it("flags the UNFULFILLED request and reserves restocked units for it", async () => {
    await restock();
    const req = (await storageApi.getBorrowRequests()).find((r) => r.id === "REQ-B-101")!;
    expect(req.restock).toBeDefined();
    const pi = await inv("EQ-001");
    expect(pi.reserved).toBe(2);
    expect(pi.available).toBe(0); // reserved units are out of the general pool
    await expect(storageApi.walkInCheckout("x", "g", [{ itemId: "EQ-001", qty: 1, sns: ["EQ-001-006"] }])).rejects.toThrow(
      /สต็อก/,
    );
  });

  it("reopens in the original queue slot and issues against the reservation", async () => {
    await restock();
    const before = (await storageApi.getBorrowRequests()).find((r) => r.id === "REQ-B-101")!.createdAt;
    const reopened = await storageApi.reopenBorrow("REQ-B-101");
    expect(reopened.status).toBe("OPEN");
    expect(reopened.createdAt).toBe(before);
    await storageApi.confirmBorrow("REQ-B-101", [{ itemId: "EQ-001", qty: 2, sns: ["EQ-001-006", "EQ-001-007"] }], pickup);
    expect((await inv("EQ-001")).reserved).toBe(0);
  });

  it("releases units to the pool after 24 hours and blocks a late reopen when stock is gone", async () => {
    await restock();
    const start = Date.now();
    clock.now = () => start + 25 * HOUR;
    const pi = await inv("EQ-001");
    expect(pi.reserved).toBe(0);
    expect(pi.available).toBe(2);
    await storageApi.walkInCheckout("x", "g", [{ itemId: "EQ-001", qty: 2, sns: ["EQ-001-006", "EQ-001-007"] }]);
    await storageApi.walkInCheckout("x", "g", [bulk("EQ-002", 5)]);
    await expect(storageApi.reopenBorrow("REQ-B-101")).rejects.toThrow();
  });
});

describe("bulk QC split", () => {
  it("splits a batch by quantity and updates stock buckets", async () => {
    await storageApi.submitQC("REQ-R-201", {
      items: [
        { id: "q1", results: ok },
        { id: "q2", results: ok },
        { id: "q3", results: { AVAILABLE: 3, DAMAGED: 1, LOST: 1 } },
      ],
      fineAmount: 300,
      fineRemark: "บางชิ้นเสีย",
    });
    const b = await inv("EQ-002");
    expect([b.available, b.qc, b.damaged, b.lost]).toEqual([45, 0, 4, 1]);
    expect((await storageApi.getQCRequest("REQ-R-201")).status).toBe("PENDING_PAYMENT");
  });

  it("rejects counts that do not add up to the batch size", async () => {
    await expect(
      storageApi.submitQC("REQ-R-201", {
        items: [
          { id: "q1", results: ok },
          { id: "q2", results: ok },
          { id: "q3", results: { AVAILABLE: 3, DAMAGED: 1, LOST: 0 } },
        ],
        fineAmount: 100,
        fineRemark: "x",
      }),
    ).rejects.toThrow(/ต้องรวมได้ 5/);
    expect((await inv("EQ-002")).qc).toBe(5); // nothing changed
  });
});

describe("not-brought items", () => {
  it("stay owed as overdue, listed first, and can later be marked lost with a fine", async () => {
    const res = await storageApi.submitReturn("6632199921", { f1: rc(0, 1, 0), f2: rc(5, 0, 0) }, "");
    expect(res.queued).toBe(5); // queued counts pieces: the whole 5-piece batch

    const owed = await storageApi.getPendingReturns("6632199921");
    expect(owed.map((i) => i.id)).toEqual(["f1"]);
    expect(owed[0].owedStatus).toBe("NOT_BROUGHT");
    expect(owed[0].notBroughtAt).toBeTypeOf("number");

    await expect(storageApi.submitReturn("6632199921", { f1: rc(0, 0, 1) }, "")).rejects.toThrow(/ค่าปรับ/);
    const lost = await storageApi.submitReturn("6632199921", { f1: rc(0, 0, 1) }, "", { amount: 1500, remark: "ทำหาย" });
    expect(lost.lost).toBe(1);
    expect(units.find((u) => u.serial === "EQ-001-011")!.status).toBe("LOST");
    expect(await storageApi.getPendingReturns("6632199921")).toHaveLength(0);
    const fine = (await storageApi.getQCRequests()).find((r) => r.status === "PENDING_PAYMENT" && r.fineAmount === 1500 && r.id !== "REQ-R-202");
    expect(fine).toBeDefined();
  });

  it("only allows LOST for items already marked not brought", async () => {
    await expect(
      storageApi.submitReturn("6632199921", { f1: rc(0, 0, 1), f2: rc(0, 5, 0) }, "", { amount: 100, remark: "x" }),
    ).rejects.toThrow(/ค้างส่ง/);
  });
});

describe("face-to-face bulk split", () => {
  it("splits a bulk batch: returned part goes to QC, the rest stays owed", async () => {
    const res = await storageApi.submitReturn("6632199921", { f1: rc(1, 0, 0), f2: rc(3, 2, 0) }, "");
    expect(res.queued).toBe(4);

    const b = await inv("EQ-002");
    expect(b.qc).toBe(8); // 5 already waiting + 3 just received

    const owed = await storageApi.getPendingReturns("6632199921");
    expect(owed.map((i) => [i.id, i.qty, i.owedStatus])).toEqual([["f2", 2, "NOT_BROUGHT"]]);

    const qc = (await storageApi.getQCRequests())[0];
    expect(qc.items.find((i) => i.id === "f2")!.qty).toBe(3);
  });

  it("rejects counts that do not add up to what is owed", async () => {
    await expect(
      storageApi.submitReturn("6632199921", { f1: rc(1, 0, 0), f2: rc(3, 1, 0) }, ""),
    ).rejects.toThrow(/ต้องรวมได้ 5/);
    expect((await storageApi.getPendingReturns("6632199921")).length).toBe(2); // nothing changed
  });
});

describe("stock invariant", () => {
  it("keeps units out accounted for: total = shelf + reserved + qc + damaged + lost + out", async () => {
    await storageApi.walkInCheckout("x", "g", [pis(2)]);
    const pi = await inv("EQ-001");
    const out = units.filter((u) => u.itemId === "EQ-001" && u.status === "OUT").length;
    expect(pi.total).toBe(pi.available + pi.reserved + pi.qc + pi.damaged + pi.lost + out);
  });
});

describe("group-owned items", () => {
  it("shows the group's owed items to every member of the group", async () => {
    const owed = await storageApi.getPendingReturns("6632199925"); // second member of Group 09
    expect(owed.map((i) => [i.id, i.requestId, i.groupId])).toEqual([
      ["f1", "REQ-B-100", "group09"],
      ["f2", "REQ-B-100", "group09"],
    ]);
  });

  it("lets another member of the group return the items", async () => {
    await storageApi.submitReturn("6632199925", { f1: rc(1, 0, 0), f2: rc(5, 0, 0) }, "");
    expect(await storageApi.getPendingReturns("6632199921")).toHaveLength(0);
  });
});

describe("student requests", () => {
  it("creates an OPEN request for one of my groups, with the type taken from the group", async () => {
    const req = await storageApi.createBorrowRequest({ groupId: "group09", items: [{ itemId: "EQ-004", qty: 2 }] });
    expect(req).toMatchObject({
      id: "REQ-B-105",
      status: "OPEN",
      groupId: "group09",
      group: "Group 09",
      type: "Course - IoT System",
      studentId: "6632199921",
    });
    expect(req.items).toEqual([{ itemId: "EQ-004", name: "Servo Motor SG90", isUnique: true, reqQty: 2, issuedQty: 0 }]);
  });

  it("accepts more than is available, queueing the request", async () => {
    await storageApi.walkInCheckout("x", "g", [pis(5)]); // shelf now has no Pis
    const req = await storageApi.createBorrowRequest({ groupId: "group09", items: [{ itemId: "EQ-001", qty: 3 }] });
    expect(req.status).toBe("UNFULFILLED"); // nothing issuable, so the sweep rule applies at once
  });

  it("rejects an empty cart, bad quantities and groups I'm not in", async () => {
    const create = (groupId: string, items: { itemId: string; qty: number }[]) =>
      storageApi.createBorrowRequest({ groupId, items });
    await expect(create("group09", [])).rejects.toThrow(/ยังไม่ได้เลือก/);
    await expect(create("group09", [{ itemId: "EQ-001", qty: 0 }])).rejects.toThrow(/ระหว่าง/);
    await expect(create("group09", [{ itemId: "EQ-001", qty: 12 }])).rejects.toThrow(/ระหว่าง/); // total is 11
    await expect(create("robotics-club", [{ itemId: "EQ-001", qty: 1 }])).rejects.toThrow(/ไม่ได้อยู่ในกลุ่ม/);
  });

  it("lists only my groups' requests, newest first, and follows the current student", async () => {
    expect((await storageApi.getCurrentStudent()).studentId).toBe("6632199921");
    expect((await storageApi.getMyRequests()).map((r) => r.id)).toEqual(["REQ-B-101", "REQ-B-100"]);

    await storageApi.setCurrentStudent("6632199925"); // Group 09 + robotics club
    expect((await storageApi.getMyRequests()).map((r) => r.id)).toEqual(["REQ-B-103", "REQ-B-101", "REQ-B-100"]);
  });

  it("decorates my requests with the serials issued against them", async () => {
    const [, closed] = await storageApi.getMyRequests();
    expect(closed.items.find((i) => i.itemId === "EQ-001")!.issuedSerials).toEqual(["EQ-001-011"]);
  });
});

describe("cancel and restock expiry", () => {
  it("cancels an OPEN request", async () => {
    const req = await storageApi.cancelBorrow("REQ-B-101");
    expect(req).toMatchObject({ status: "CANCELLED", cancelReason: "BY_STUDENT" });
  });

  it("frees reserved units when a restock-flagged request is cancelled", async () => {
    await restock();
    expect((await inv("EQ-001")).reserved).toBe(2);
    await storageApi.cancelBorrow("REQ-B-101");
    const pi = await inv("EQ-001");
    expect(pi.reserved).toBe(0);
    expect(pi.available).toBe(2);
  });

  it("rejects cancelling a request that was already issued", async () => {
    await storageApi.confirmBorrow("REQ-B-103", [{ itemId: "EQ-004", qty: 1, sns: ["EQ-004-001"] }], pickup);
    await expect(storageApi.cancelBorrow("REQ-B-103")).rejects.toThrow(/ยกเลิกได้เฉพาะ/);
  });

  it("auto-cancels a flagged request that is not reopened within 24 hours", async () => {
    await restock();
    const start = Date.now();
    clock.now = () => start + 25 * HOUR;
    const req = (await storageApi.getBorrowRequests()).find((r) => r.id === "REQ-B-101")!;
    expect(req).toMatchObject({ status: "CANCELLED", cancelReason: "RESTOCK_EXPIRED" });
    expect(req.restock).toBeUndefined();
    await expect(storageApi.reopenBorrow("REQ-B-101")).rejects.toThrow(/หมดเวลาเปิดคำขอแล้ว/);
  });
});
