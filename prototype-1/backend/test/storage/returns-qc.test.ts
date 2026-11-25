import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/db.js";
import { getQc, listQc, submitQc, verifySlip } from "../../src/modules/storage/qc.js";
import { createRequest, issueRequest, staffPickup } from "../../src/modules/storage/requests.js";
import { listMyOwed, listStudentOwed, submitReturn } from "../../src/modules/storage/returns.js";
import { clock } from "../../src/modules/storage/tx.js";
import { HOUR, actor, bulk, inv, ok, pickup, qcIds, rc, resetStorage, staffId } from "./helpers.js";

beforeEach(resetStorage);

/** Owed ids for a student by serial (unique) or item code (bulk). */
async function owedIds(studentNo: string): Promise<Record<string, string>> {
  return Object.fromEntries((await listStudentOwed(studentNo)).map((o) => [o.serialNumber ?? o.itemId, o.id]));
}
const ret = async (studentId: string, results: Record<string, ReturnType<typeof rc>>, fine?: { amount: number; remark: string }) =>
  submitReturn(await staffId(), { studentId, results, remark: "", fine });

describe("bulk QC split", () => {
  it("splits a batch by quantity and updates stock buckets", async () => {
    const ids = await qcIds("REQ-R-201");
    await submitQc(await staffId(), "REQ-R-201", {
      items: [
        { id: ids["EQ-001-006"]!, results: ok },
        { id: ids["EQ-001-007"]!, results: ok },
        { id: ids["EQ-002"]!, results: { AVAILABLE: 3, DAMAGED: 1, LOST: 1 } },
      ],
      fineAmount: 30000,
      fineRemark: "บางชิ้นเสีย",
    });
    const b = await inv("EQ-002");
    expect([b.available, b.qc, b.damaged, b.lost]).toEqual([45, 0, 4, 1]);
    expect(await getQc("REQ-R-201")).toMatchObject({ status: "PENDING_PAYMENT", fineAmount: 30000 });
  });

  it("rejects counts that do not add up to the batch size", async () => {
    const ids = await qcIds("REQ-R-201");
    await expect(
      submitQc(await staffId(), "REQ-R-201", {
        items: [
          { id: ids["EQ-001-006"]!, results: ok },
          { id: ids["EQ-001-007"]!, results: ok },
          { id: ids["EQ-002"]!, results: { AVAILABLE: 3, DAMAGED: 1, LOST: 0 } },
        ],
        fineAmount: 10000,
        fineRemark: "x",
      }),
    ).rejects.toThrow(/ต้องรวมได้ 5/);
    expect((await inv("EQ-002")).qc).toBe(5); // nothing changed
  });

  it("closes a pending-payment task only on a valid slip", async () => {
    expect((await verifySlip(await staffId(), "REQ-R-202", false)).status).toBe("PENDING_PAYMENT");
    expect((await verifySlip(await staffId(), "REQ-R-202", true)).status).toBe("CLOSED");
    await expect(verifySlip(await staffId(), "REQ-R-202", true)).rejects.toThrow(/ไม่ได้รอชำระเงิน/);
  });
});

describe("not-brought items", () => {
  it("stay owed as overdue, listed first, and can later be marked lost with a fine", async () => {
    const ids = await owedIds("6800000001");
    const res = await ret("6800000001", { [ids["EQ-001-011"]!]: rc(0, 1, 0), [ids["EQ-002"]!]: rc(5, 0, 0) });
    expect(res.queued).toBe(5);

    const owed = await listStudentOwed("6800000001");
    expect(owed.map((i) => i.id)).toEqual([ids["EQ-001-011"]]);
    expect(owed[0]!.owedStatus).toBe("NOT_BROUGHT");
    expect(owed[0]!.notBroughtAt).toBeTypeOf("number");

    await expect(ret("6800000001", { [ids["EQ-001-011"]!]: rc(0, 0, 1) })).rejects.toThrow(/ค่าปรับ/);
    const lost = await ret("6800000001", { [ids["EQ-001-011"]!]: rc(0, 0, 1) }, { amount: 150000, remark: "ทำหาย" });
    expect(lost.lost).toBe(1);
    expect((await prisma.storageUnit.findUniqueOrThrow({ where: { serial: "EQ-001-011" } })).status).toBe("lost");
    expect(await listStudentOwed("6800000001")).toHaveLength(0);
    const fine = (await listQc()).find((r) => r.status === "PENDING_PAYMENT" && r.fineAmount === 150000 && r.id !== "REQ-R-202");
    expect(fine).toBeDefined();
    const r100 = await prisma.storageRequest.findUniqueOrThrow({ where: { requestNo: "REQ-B-100" } });
    expect(await prisma.notification.count({ where: { type: "storage.fine_due", subjectId: r100.id } })).toBe(2);
  });

  it("a partly lost bulk row keeps the rest owed and counts the loss; QC and fine tasks open together", async () => {
    const find = async (itemId: string) => (await listStudentOwed("6800000001")).find((o) => o.requestId === "REQ-B-100" && o.itemId === itemId)!;
    const pi = (await find("EQ-001")).id;
    const bb = (await find("EQ-002")).id;
    await ret("6800000001", { [pi]: rc(0, 1, 0), [bb]: rc(0, 5, 0) });
    const res = await ret("6800000001", { [pi]: rc(1, 0, 0), [bb]: rc(0, 3, 2) }, { amount: 20000, remark: "หาย 2 ชิ้น" });
    expect(res).toEqual({ queued: 1, lost: 2 });

    const owed = await listStudentOwed("6800000001");
    expect(owed.map((o) => [o.itemId, o.qty, o.owedStatus])).toEqual([["EQ-002", 3, "NOT_BROUGHT"]]);
    expect((await inv("EQ-002")).lost).toBe(2);

    const [a, b] = (await listQc()).slice(0, 2);
    const tasks = [a!, b!];
    const open = tasks.find((t) => t.status === "OPEN")!;
    const fine = tasks.find((t) => t.status === "PENDING_PAYMENT")!;
    expect(open.items.map((i) => [i.serialNumber ?? i.itemId, i.qty])).toEqual([["EQ-001-011", 1]]);
    expect(fine.fineAmount).toBe(20000);
    expect(fine.items.map((i) => [i.itemId, i.qty])).toEqual([["EQ-002", 2]]);
  });

  it("only allows LOST for items already marked not brought", async () => {
    const ids = await owedIds("6800000001");
    await expect(
      ret("6800000001", { [ids["EQ-001-011"]!]: rc(0, 0, 1), [ids["EQ-002"]!]: rc(0, 5, 0) }, { amount: 10000, remark: "x" }),
    ).rejects.toThrow(/ค้างส่ง/);
  });
});

describe("face-to-face bulk split", () => {
  it("splits a bulk batch: returned part goes to QC, the rest stays owed", async () => {
    const ids = await owedIds("6800000001");
    const res = await ret("6800000001", { [ids["EQ-001-011"]!]: rc(1, 0, 0), [ids["EQ-002"]!]: rc(3, 2, 0) });
    expect(res.queued).toBe(4);
    expect((await inv("EQ-002")).qc).toBe(8); // 5 already waiting + 3 just received
    const owed = await listStudentOwed("6800000001");
    expect(owed.map((i) => [i.id, i.qty, i.owedStatus])).toEqual([[ids["EQ-002"], 2, "NOT_BROUGHT"]]);
    const qc = (await listQc())[0]!;
    expect(qc.items.find((i) => i.itemId === "EQ-002")!.qty).toBe(3);
  });

  it("rejects counts that do not add up to what is owed", async () => {
    const ids = await owedIds("6800000001");
    await expect(ret("6800000001", { [ids["EQ-001-011"]!]: rc(1, 0, 0), [ids["EQ-002"]!]: rc(3, 1, 0) })).rejects.toThrow(/ต้องรวมได้ 5/);
    expect(await listStudentOwed("6800000001")).toHaveLength(2);
  });
});

describe("group-owned items", () => {
  it("shows the group's owed items to every member of the group", async () => {
    const owed = await listMyOwed(await actor("student2@test.local"));
    expect(owed.map((o) => [o.serialNumber ?? o.itemId, o.requestId, o.group])).toEqual([
      ["EQ-001-011", "REQ-B-100", "Group 09"],
      ["EQ-002", "REQ-B-100", "Group 09"],
    ]);
  });

  it("lets another member of the group return the items", async () => {
    const ids = await owedIds("6800000002");
    await ret("6800000002", { [ids["EQ-001-011"]!]: rc(1, 0, 0), [ids["EQ-002"]!]: rc(5, 0, 0) });
    expect(await listStudentOwed("6800000001")).toHaveLength(0);
  });

  it("labels the QC task with every group the returned items belong to", async () => {
    const s2 = await actor("student2@test.local");
    const robotics = (await prisma.group.findFirstOrThrow({ where: { name: "ชมรมหุ่นยนต์" } })).id;
    const req = await createRequest(s2, { groupId: robotics, items: [{ itemId: "EQ-002", qty: 1 }] });
    await issueRequest(await staffId(), req.id, [bulk("EQ-002", 1)], pickup);
    await staffPickup(await staffId(), req.id);
    const ids = await owedIds("6800000002");
    const robo = (await listStudentOwed("6800000002")).find((o) => o.requestId === req.id)!;
    const g09Bulk = (await listStudentOwed("6800000002")).find((o) => o.requestId === "REQ-B-100" && o.itemId === "EQ-002")!;
    await ret("6800000002", { [ids["EQ-001-011"]!]: rc(1, 0, 0), [g09Bulk.id]: rc(5, 0, 0), [robo.id]: rc(1, 0, 0) });
    expect((await listQc())[0]!.group).toBe("Group 09, ชมรมหุ่นยนต์");
  });

  it("sorts my owed items: not brought, then overdue, then soonest due", async () => {
    const start = new Date("2027-03-01T09:00:00+07:00").getTime(); // before the seed due date
    clock.now = () => new Date(start);
    const s = await actor("student@test.local");
    const g09 = (await prisma.group.findFirstOrThrow({ where: { name: "Group 09" } })).id;
    const req = await createRequest(s, { groupId: g09, items: [{ itemId: "EQ-002", qty: 2 }] });
    await issueRequest(await staffId(), req.id, [bulk("EQ-002", 2)], pickup);
    await staffPickup(await staffId(), req.id);
    await prisma.storageRequest.update({ where: { requestNo: req.id }, data: { dueAt: new Date(start + HOUR) } });
    clock.now = () => new Date(start + 2 * HOUR); // the new request is now overdue
    await prisma.storageOwedItem.updateMany({ where: { serial: "EQ-001-011" }, data: { status: "not_brought" } });

    const owed = await listMyOwed(s);
    expect(owed.map((o) => [o.serialNumber ?? o.itemId, o.requestId])).toEqual([
      ["EQ-001-011", "REQ-B-100"],
      ["EQ-002", req.id],
      ["EQ-002", "REQ-B-100"],
    ]);
  });
});
