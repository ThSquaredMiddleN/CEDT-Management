import { audit } from "../../core/audit.js";
import type { Tx } from "../../db.js";
import { conflict, notFound, validation } from "../../lib/errors.js";
import { notifyRequest } from "./access.js";
import { restockItem } from "./stock.js";
import { storageTx } from "./tx.js";
import { qcInclude, qcView } from "./views.js";

type Results = { AVAILABLE: number; DAMAGED: number; LOST: number };

export async function nextTaskNo(tx: Tx): Promise<string> {
  const [row] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('storage_qc_task_seq') AS n`;
  return `REQ-R-${row!.n}`;
}

async function loadTask(tx: Tx, taskNo: string) {
  const t = await tx.storageQcTask.findUnique({ where: { taskNo }, include: qcInclude });
  if (!t) throw notFound("ไม่พบรายการ QC");
  return t;
}

/** Fine notices go to the owners of every request the task's items came from. */
export async function notifyFine(tx: Tx, requestIds: (string | null)[], taskNo: string, fineSatang: number): Promise<void> {
  const ids = [...new Set(requestIds.filter((x): x is string => !!x))];
  for (const id of ids) {
    const req = await tx.storageRequest.findUniqueOrThrow({ where: { id } });
    await notifyRequest(tx, req, "storage.fine_due", `มีค่าปรับ ${(fineSatang / 100).toLocaleString("th-TH")} บาท จากรายการ ${taskNo} กรุณาชำระและแนบสลิป`);
  }
}

export const listQc = () =>
  storageTx(async (tx) =>
    (await tx.storageQcTask.findMany({ include: qcInclude, orderBy: [{ createdAt: "desc" }, { taskNo: "desc" }] })).map(qcView),
  );

export const getQc = (taskNo: string) => storageTx(async (tx) => qcView(await loadTask(tx, taskNo)));

/**
 * Each item's results (available/damaged/lost counts) must add up to its qty, so a bulk batch can be split.
 * Any damaged/lost needs a fine (satang) and makes the task PENDING_PAYMENT; otherwise CLOSED.
 * Units that pass are restocked, which flags and holds them for waiting requests.
 */
export function submitQc(actorId: string, taskNo: string, sub: { items: { id: string; results: Results }[]; fineAmount: number; fineRemark: string }) {
  return storageTx(async (tx, now) => {
    const task = await loadTask(tx, taskNo);
    if (task.status !== "open") throw conflict("รายการนี้ถูกตรวจแล้ว");
    const pending = task.items.filter((i) => i.status === "pending_test");
    const plan = pending.map((it) => {
      const entry = sub.items.find((s) => s.id === it.id);
      if (!entry) throw validation("ยังระบุผลตรวจไม่ครบทุกรายการ");
      const r = entry.results;
      const n = [r.AVAILABLE, r.DAMAGED, r.LOST];
      if (n.some((x) => !Number.isInteger(x) || x < 0)) throw validation("จำนวนผลตรวจไม่ถูกต้อง");
      if (n.reduce((a, b) => a + b, 0) !== it.qty) throw validation(`ผลตรวจของ ${it.item.name} ต้องรวมได้ ${it.qty} ชิ้น`);
      return { it, r };
    });
    const liability = plan.some(({ r }) => r.DAMAGED > 0 || r.LOST > 0);
    if (liability && !(sub.fineAmount > 0)) throw validation("กรุณาระบุยอดค่าปรับ");

    for (const { it } of plan) {
      if (it.item.isUnique) {
        const unit = await tx.storageUnit.findUnique({ where: { serial: it.serial! } });
        if (!unit || unit.status !== "qc") throw conflict(`Serial ${it.serial} ไม่ได้อยู่ในคิว QC`);
      } else {
        const item = await tx.storageItem.findUniqueOrThrow({ where: { id: it.itemId } });
        if (item.bulkQc < it.qty) throw conflict(`ยอด QC ของ ${item.name} ไม่ตรงกับรายการ`);
      }
    }

    const restocked = new Map<string, number>();
    for (const { it, r } of plan) {
      if (it.item.isUnique) {
        await tx.storageUnit.update({ where: { serial: it.serial! }, data: { status: r.LOST ? "lost" : r.DAMAGED ? "damaged" : "available" } });
      } else {
        await tx.storageItem.update({
          where: { id: it.itemId },
          data: { bulkQc: { decrement: it.qty }, bulkAvailable: { increment: r.AVAILABLE }, bulkDamaged: { increment: r.DAMAGED }, bulkLost: { increment: r.LOST } },
        });
      }
      if (r.AVAILABLE > 0) restocked.set(it.itemId, (restocked.get(it.itemId) ?? 0) + r.AVAILABLE);
      await tx.storageQcTaskItem.update({
        where: { id: it.id },
        data: { status: r.LOST > 0 ? "lost" : r.DAMAGED > 0 ? "damaged" : "available", resAvailable: r.AVAILABLE, resDamaged: r.DAMAGED, resLost: r.LOST },
      });
    }
    for (const [itemId, qty] of restocked) await restockItem(tx, itemId, qty, now);

    const status = liability ? "pending_payment" : "closed";
    await tx.storageQcTask.update({
      where: { id: task.id },
      data: { status, fineSatang: liability ? sub.fineAmount : 0, fineRemark: liability ? sub.fineRemark : "" },
    });
    await audit(tx, { actorId, action: "storage.qc.submitted", subjectType: "storage_qc_task", subjectId: task.id, after: { status, fineSatang: liability ? sub.fineAmount : 0 } });
    if (liability) await notifyFine(tx, task.items.map((i) => i.requestId), taskNo, sub.fineAmount);
    return { status: status.toUpperCase() };
  });
}

/** Slip verification: only a valid slip closes a PENDING_PAYMENT task. */
export function verifySlip(actorId: string, taskNo: string, valid: boolean) {
  return storageTx(async (tx) => {
    const task = await loadTask(tx, taskNo);
    if (task.status !== "pending_payment") throw conflict("รายการนี้ไม่ได้รอชำระเงิน");
    if (valid) await tx.storageQcTask.update({ where: { id: task.id }, data: { status: "closed" } });
    await audit(tx, { actorId, action: "storage.payment.verified", subjectType: "storage_qc_task", subjectId: task.id, after: { valid } });
    return { status: valid ? "CLOSED" : "PENDING_PAYMENT" };
  });
}
