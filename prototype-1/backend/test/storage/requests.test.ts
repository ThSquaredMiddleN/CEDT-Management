import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/db.js";
import { runExpirySweep } from "../../src/modules/storage/job.js";
import { listMyOwed } from "../../src/modules/storage/returns.js";
import {
  cancelMyRequest, createRequest, getMe, getRequest, issueRequest, listMyRequests, listRequests, lookupStudent,
  pickupMyRequest, rejectRequest, reopenMyRequest, setDue, staffPickup,
} from "../../src/modules/storage/requests.js";
import { setDefaultDue } from "../../src/modules/storage/settings.js";
import { clock } from "../../src/modules/storage/tx.js";
import { DAY, HOUR, actor, bulk, inv, pickup, pis, resetStorage, restock, staffId, walk } from "./helpers.js";

beforeEach(resetStorage);

const student = () => actor("student@test.local"); // 6800000001, Group 09
const student2 = () => actor("student2@test.local"); // 6800000002, Group 09 + ชมรมหุ่นยนต์
const ta = () => actor("ta@test.local"); // 6800000003, ชมรมหุ่นยนต์
const groupId = async (name: string) => (await prisma.group.findFirstOrThrow({ where: { name } })).id;

describe("me", () => {
  it("lists my groups with types, then personal", async () => {
    const me = await getMe(await student2());
    expect(me.studentId).toBe("6800000002");
    expect(me.groups.map((g) => [g.label, g.type])).toEqual([
      ["Group 09", "Course - Digital Systems Lab"],
      ["ชมรมหุ่นยนต์", "Custom"],
      ["ส่วนตัว", "Personal"],
    ]);
  });
});

describe("student requests", () => {
  it("creates an OPEN request for one of my groups, with the type taken from the group", async () => {
    const req = await createRequest(await student(), { groupId: await groupId("Group 09"), items: [{ itemId: "EQ-004", qty: 2 }] });
    expect(req).toMatchObject({ id: "REQ-B-105", status: "OPEN", group: "Group 09", type: "Course - Digital Systems Lab", studentId: "6800000001" });
    expect(req.items).toEqual([{ itemId: "EQ-004", name: "Servo Motor SG90", isUnique: true, reqQty: 2, issuedQty: 0 }]);
  });

  it("creates a personal request", async () => {
    const req = await createRequest(await student(), { groupId: "personal", items: [{ itemId: "EQ-002", qty: 1 }] });
    expect(req).toMatchObject({ groupId: "personal", group: "ส่วนตัว", type: "Personal" });
  });

  it("accepts more than is available, queueing the request", async () => {
    await walk([pis(5)]);
    const req = await createRequest(await student(), { groupId: "personal", items: [{ itemId: "EQ-001", qty: 3 }] });
    expect(req.status).toBe("UNFULFILLED");
  });

  it("rejects an empty cart, bad quantities and groups I'm not in", async () => {
    const s = await student();
    const g09 = await groupId("Group 09");
    await expect(createRequest(s, { groupId: g09, items: [] })).rejects.toThrow(/ยังไม่ได้เลือก/);
    await expect(createRequest(s, { groupId: g09, items: [{ itemId: "EQ-001", qty: 0 }] })).rejects.toThrow(/ระหว่าง/);
    await expect(createRequest(s, { groupId: g09, items: [{ itemId: "EQ-001", qty: 12 }] })).rejects.toThrow(/ระหว่าง/); // total 11
    await expect(createRequest(s, { groupId: await groupId("ชมรมหุ่นยนต์"), items: [{ itemId: "EQ-001", qty: 1 }] })).rejects.toThrow(/ไม่ได้อยู่ในกลุ่ม/);
  });

  it("lists only my groups' requests, newest first", async () => {
    expect((await listMyRequests(await student())).map((r) => r.id)).toEqual(["REQ-B-101", "REQ-B-100"]);
    expect((await listMyRequests(await student2())).map((r) => r.id)).toEqual(["REQ-B-103", "REQ-B-101", "REQ-B-100"]);
  });

  it("decorates my requests with the serials issued against them", async () => {
    const [, closed] = await listMyRequests(await student());
    expect(closed!.items.find((i) => i.itemId === "EQ-001")!.issuedSerials).toEqual(["EQ-001-011"]);
  });

  it("hides another group's request (404)", async () => {
    await expect(cancelMyRequest(await student(), "REQ-B-103")).rejects.toThrow(/ไม่พบคำขอ/);
  });

  it("hides another group's request from reopen and pickup (404)", async () => {
    await expect(reopenMyRequest(await student(), "REQ-B-103")).rejects.toThrow(/ไม่พบคำขอ/);
    await expect(pickupMyRequest(await student(), "REQ-B-103")).rejects.toThrow(/ไม่พบคำขอ/);
  });

  it("cannot choose an inactive group, but still sees its requests", async () => {
    const id = await groupId("Group 09");
    await prisma.group.update({ where: { id }, data: { isActive: false } });
    try {
      await expect(createRequest(await student(), { groupId: id, items: [{ itemId: "EQ-002", qty: 1 }] })).rejects.toThrow(/ไม่ได้อยู่ในกลุ่ม/);
      expect((await listMyRequests(await student())).map((r) => r.id)).toContain("REQ-B-100");
    } finally {
      await prisma.group.update({ where: { id }, data: { isActive: true } });
    }
  });
});

describe("cancel and restock expiry", () => {
  it("cancels an OPEN request", async () => {
    expect(await cancelMyRequest(await student(), "REQ-B-101")).toMatchObject({ status: "CANCELLED", cancelReason: "BY_STUDENT" });
  });

  it("frees held units when a restock-flagged request is cancelled", async () => {
    await restock();
    expect((await inv("EQ-001")).reserved).toBe(2);
    await cancelMyRequest(await student(), "REQ-B-101");
    const pi = await inv("EQ-001");
    expect(pi.reserved).toBe(0);
    expect(pi.available).toBe(2);
  });

  it("offers units freed by a cancelled hold to the next UNFULFILLED request", async () => {
    await restock();
    const waiting = await createRequest(await student2(), { groupId: await groupId("Group 09"), items: [{ itemId: "EQ-001", qty: 2 }] });
    expect(waiting.status).toBe("UNFULFILLED");
    await cancelMyRequest(await student(), "REQ-B-101");
    const after = (await listRequests()).find((r) => r.id === waiting.id)!;
    expect(after.restock).toBeDefined();
    expect((await inv("EQ-001")).reserved).toBe(2);
  });

  it("rejects cancelling a request that was already issued", async () => {
    await issueRequest(await staffId(), "REQ-B-103", [{ itemId: "EQ-004", qty: 1, sns: ["EQ-004-001"] }], pickup);
    await expect(cancelMyRequest(await ta(), "REQ-B-103")).rejects.toThrow(/ยกเลิกได้เฉพาะ/);
  });

  it("reopens in the original queue place and issues against the hold", async () => {
    await restock();
    const before = (await getRequest("REQ-B-101")).createdAt;
    const reopened = await reopenMyRequest(await student2(), "REQ-B-101"); // any group member may act
    expect(reopened.status).toBe("OPEN");
    expect(reopened.createdAt).toBe(before);
    await issueRequest(await staffId(), "REQ-B-101", [{ itemId: "EQ-001", qty: 2, sns: ["EQ-001-006", "EQ-001-007"] }], pickup);
    expect((await inv("EQ-001")).reserved).toBe(0);
  });

  it("auto-cancels a flagged request that is not reopened within 24 hours", async () => {
    await restock();
    const start = Date.now();
    clock.now = () => new Date(start + 25 * HOUR);
    const req = await getRequest("REQ-B-101");
    expect(req).toMatchObject({ status: "CANCELLED", cancelReason: "RESTOCK_EXPIRED" });
    expect(req.restock).toBeUndefined();
    await expect(reopenMyRequest(await student(), "REQ-B-101")).rejects.toThrow(/หมดเวลาเปิดคำขอแล้ว/);
    expect(await prisma.auditLog.count({ where: { action: "storage.request.expired" } })).toBeGreaterThan(0);
    const pi = await inv("EQ-001");
    expect([pi.reserved, pi.available]).toEqual([0, 2]);
  });

  it("the background sweep cancels expired holds without any request", async () => {
    await restock();
    const start = Date.now();
    clock.now = () => new Date(start + 25 * HOUR);
    await runExpirySweep();
    const row = await prisma.storageRequest.findUniqueOrThrow({ where: { requestNo: "REQ-B-101" } });
    expect([row.status, row.cancelReason]).toEqual(["cancelled", "restock_expired"]);
    expect(await prisma.notification.count({ where: { type: "storage.hold_expired", subjectId: row.id } })).toBe(2);
  });
});

describe("issue, pickup and due dates", () => {
  const DUE = Date.now() + 120 * DAY;
  const issueB103 = async () =>
    issueRequest(await staffId(), "REQ-B-103", [{ itemId: "EQ-004", qty: 2, sns: ["EQ-004-001", "EQ-004-002"] }], pickup);

  it("stores the pickup details and notifies the group", async () => {
    await issueB103();
    const req = await getRequest("REQ-B-103");
    expect(req.status).toBe("READY_FOR_PICKUP");
    expect(req.pickup).toEqual({ pickupAt: new Date(pickup.pickupAt).toISOString(), location: "counter", remark: "" });
    const row = await prisma.storageRequest.findUniqueOrThrow({ where: { requestNo: "REQ-B-103" } });
    expect(await prisma.notification.count({ where: { type: "storage.pickup_ready", subjectId: row.id } })).toBe(2); // ta + student2
  });

  it("closes on pickup, copies the default due date and makes the items owed by the group", async () => {
    await issueB103();
    await setDefaultDue(await staffId(), DUE);
    const req = await pickupMyRequest(await ta(), "REQ-B-103");
    expect(req).toMatchObject({ status: "CLOSED", dueAt: DUE });
    expect(req.pickedUpAt).toBeTypeOf("number");
    const owed = await listMyOwed(await ta());
    expect(owed.map((i) => [i.serialNumber, i.requestId, i.group, i.dueAt])).toEqual([
      ["EQ-004-001", "REQ-B-103", "ชมรมหุ่นยนต์", DUE],
      ["EQ-004-002", "REQ-B-103", "ชมรมหุ่นยนต์", DUE],
    ]);
    await expect(staffPickup(await staffId(), "REQ-B-103")).rejects.toThrow(/ยังไม่พร้อม/);
  });

  it("lets staff confirm a counter pickup", async () => {
    await issueB103();
    expect((await staffPickup(await staffId(), "REQ-B-103")).status).toBe("CLOSED");
  });

  it("rejects a default due date in the past", async () => {
    await expect(setDefaultDue(await staffId(), Date.now() - DAY)).rejects.toThrow(/อนาคต/);
  });

  it("moves the due date of one request and of its owed items", async () => {
    await issueB103();
    await staffPickup(await staffId(), "REQ-B-103");
    const later = DUE + 7 * DAY;
    expect((await setDue(await staffId(), "REQ-B-103", later)).dueAt).toBe(later);
    expect((await listMyOwed(await ta())).map((i) => i.dueAt)).toEqual([later, later]);
    await expect(setDue(await staffId(), "REQ-B-103", 0)).rejects.toThrow(/ไม่ก่อนวันที่รับของ/);
    await expect(setDue(await staffId(), "REQ-B-101", later)).rejects.toThrow(/เฉพาะคำขอที่รับของแล้ว/);
  });

  it("refuses to issue an item that is not in the request", async () => {
    await expect(issueRequest(await staffId(), "REQ-B-101", [bulk("EQ-003", 1)], pickup)).rejects.toThrow(/ไม่อยู่ในคำขอนี้/);
  });

  it("rejects issuing more than requested", async () => {
    await expect(issueRequest(await staffId(), "REQ-B-101", [bulk("EQ-002", 6)], pickup)).rejects.toThrow(/เกินจำนวนที่ขอ/);
  });
});

describe("reject", () => {
  it("rejects an OPEN request with a reason, notifies and audits", async () => {
    const req = await rejectRequest(await staffId(), "REQ-B-101", "  ไม่มีรายวิชานี้แล้ว ");
    expect(req).toMatchObject({ status: "REJECTED", rejectReason: "ไม่มีรายวิชานี้แล้ว" });
    expect(req.rejectedAt).toBeTypeOf("number");
    const row = await prisma.storageRequest.findUniqueOrThrow({ where: { requestNo: "REQ-B-101" } });
    expect(await prisma.notification.count({ where: { type: "storage.request_rejected", subjectId: row.id } })).toBe(2);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "storage.request.rejected", subjectId: row.id } });
    expect(log.note).toBe("ไม่มีรายวิชานี้แล้ว");
  });

  it("requires a reason and refuses issued requests", async () => {
    await expect(rejectRequest(await staffId(), "REQ-B-101", "   ")).rejects.toThrow(/เหตุผล/);
    await expect(rejectRequest(await staffId(), "REQ-B-100", "x")).rejects.toThrow(/ปฏิเสธได้เฉพาะ/);
  });

  it("rejects an UNFULFILLED request", async () => {
    expect(await rejectRequest(await staffId(), "REQ-B-104", "หมดรุ่น")).toMatchObject({ status: "REJECTED" });
  });

  it("offers a rejected request's held units to the queue", async () => {
    await restock();
    const waiting = await createRequest(await student2(), { groupId: await groupId("Group 09"), items: [{ itemId: "EQ-001", qty: 2 }] });
    await rejectRequest(await staffId(), "REQ-B-101", "ซ้ำ");
    expect((await listRequests()).find((r) => r.id === waiting.id)!.restock).toBeDefined();
  });
});

describe("walk-in and lookup", () => {
  it("creates a picked-up request whose items are owed at once", async () => {
    const s = await student();
    const { requestId } = await (await import("../../src/modules/storage/requests.js")).walkIn(await staffId(), {
      studentId: "6800000001",
      groupId: "personal",
      lines: [bulk("EQ-003", 2)],
    });
    const req = await getRequest(requestId);
    expect(req).toMatchObject({ status: "CLOSED", channel: "WALK_IN", group: "ส่วนตัว" });
    expect((await listMyOwed(s)).some((o) => o.requestId === requestId && o.qty === 2)).toBe(true);
  });

  it("records a walk-in for a student without an account; it appears once they log in", async () => {
    const { requestId } = await walk([bulk("EQ-003", 1)]); // 6800000009 has no account
    const user = await prisma.user.create({ data: { email: "late-student@test.local", name: "นิสิต มาทีหลัง", studentNo: "6800000009" } });
    try {
      const owed = await listMyOwed({ id: user.id, name: user.name, studentNo: "6800000009" });
      expect(owed.map((o) => o.requestId)).toEqual([requestId]);
    } finally {
      await prisma.storageRequest.updateMany({ where: { requestedById: user.id }, data: { requestedById: null } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  it("looks up a student without an account through their groups, and 404s an unknown number", async () => {
    expect(await lookupStudent("6800000004")).toMatchObject({ studentId: "6800000004", name: "6800000004" });
    await expect(lookupStudent("6899999999")).rejects.toThrow(/ไม่พบรหัสนิสิตนี้/);
  });
});

describe("concurrency", () => {
  it("lets exactly one of two simultaneous issues of the last unit succeed", async () => {
    await walk([{ itemId: "EQ-001", qty: 4, sns: ["EQ-001-001", "EQ-001-002", "EQ-001-003", "EQ-001-004"] }]);
    const results = await Promise.allSettled([
      walk([{ itemId: "EQ-001", qty: 1, sns: ["EQ-001-005"] }]),
      walk([{ itemId: "EQ-001", qty: 1, sns: ["EQ-001-005"] }]),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await inv("EQ-001")).available).toBe(0);
  });
});
