import { audit } from "../../core/audit.js";
import { findUserByStudentNo } from "../../core/users.js";
import { conflict, validation } from "../../lib/errors.js";
import { nextTaskNo, notifyFine } from "./qc.js";
import { ownedWhere, requireStudentNo, type StorageActor } from "./access.js";
import { storageTx } from "./tx.js";
import { owedInclude, owedView, sortOwed } from "./views.js";
import type { Tx } from "../../db.js";

export async function owedRows(tx: Tx, studentNo: string) {
  return tx.storageOwedItem.findMany({
    where: { request: await ownedWhere(tx, studentNo) },
    include: owedInclude,
    orderBy: [{ createdAt: "asc" }, { serial: { sort: "asc", nulls: "last" } }, { id: "asc" }],
  });
}

export const listMyOwed = (user: StorageActor) =>
  storageTx(async (tx, now) => sortOwed((await owedRows(tx, requireStudentNo(user))).map(owedView), now.getTime()));

/** Counter: owed items of all the student's groups plus their personal requests. */
export const listStudentOwed = (studentNo: string) =>
  storageTx(async (tx, now) => sortOwed((await owedRows(tx, studentNo)).map(owedView), now.getTime()));

type Counts = { RETURNED: number; NOT_BROUGHT: number; LOST: number };

/**
 * Face-to-face return. Each owed line is split by counts that must add up to its qty:
 * RETURNED goes to QC; NOT_BROUGHT stays owed (overdue); LOST (only for lines already not brought)
 * is counted lost and a PENDING_PAYMENT task with the fine (satang) is opened.
 * A partly returned bulk line keeps only its not-brought remainder owed.
 */
export function submitReturn(
  actorId: string,
  input: { studentId: string; results: Record<string, Counts>; remark: string; fine?: { amount: number; remark: string } },
) {
  return storageTx(async (tx, now) => {
    const owed = await owedRows(tx, input.studentId);
    if (owed.length === 0) throw validation("ไม่มีรายการค้างส่ง");
    const plan = owed.map((i) => {
      const r = input.results[i.id];
      if (!r) throw validation("ยังระบุสถานะไม่ครบทุกรายการ");
      const n = [r.RETURNED, r.NOT_BROUGHT, r.LOST];
      if (n.some((x) => !Number.isInteger(x) || x < 0)) throw validation("จำนวนไม่ถูกต้อง");
      if (n.reduce((a, b) => a + b, 0) !== i.qty) throw validation(`จำนวนของ ${i.item.name} ต้องรวมได้ ${i.qty} ชิ้น`);
      if (r.LOST > 0 && i.status !== "not_brought") throw validation("ระบุสูญหายได้เฉพาะรายการที่ค้างส่ง (ไม่ได้นำมา) แล้ว");
      return { i, r };
    });
    const lostLines = plan.filter(({ r }) => r.LOST > 0);
    if (lostLines.length > 0 && !(input.fine && input.fine.amount > 0)) throw validation("กรุณาระบุยอดค่าปรับ");
    for (const { i, r } of plan) {
      if (i.item.isUnique && (r.RETURNED > 0 || r.LOST > 0)) {
        const unit = await tx.storageUnit.findUnique({ where: { serial: i.serial! } });
        if (!unit || unit.status !== "out") throw conflict(`Serial ${i.serial} ไม่อยู่ในสถานะที่ยืมออกไป`);
      }
    }

    for (const { i, r } of plan) {
      if (i.item.isUnique) {
        if (r.RETURNED > 0) await tx.storageUnit.update({ where: { serial: i.serial! }, data: { status: "qc" } });
        if (r.LOST > 0) await tx.storageUnit.update({ where: { serial: i.serial! }, data: { status: "lost" } });
      } else if (r.RETURNED > 0 || r.LOST > 0) {
        await tx.storageItem.update({ where: { id: i.itemId }, data: { bulkQc: { increment: r.RETURNED }, bulkLost: { increment: r.LOST } } });
      }
    }

    const user = await findUserByStudentNo(tx, input.studentId);
    const base = {
      kind: "Face-to-Face Return",
      groupLabel: [...new Set(owed.map((o) => o.request.group?.name ?? "ส่วนตัว"))].join(", ") || "-",
      requesterLabel: user?.name ?? input.studentId,
    };
    const received = plan.filter(({ r }) => r.RETURNED > 0);
    if (received.length > 0) {
      const task = await tx.storageQcTask.create({ data: { taskNo: await nextTaskNo(tx), status: "open", ...base, createdAt: now } });
      await tx.storageQcTaskItem.createMany({
        data: received.map(({ i, r }) => ({ taskId: task.id, requestId: i.requestId, itemId: i.itemId, serial: i.serial, qty: r.RETURNED })),
      });
      await audit(tx, { actorId, action: "storage.return.received", subjectType: "storage_qc_task", subjectId: task.id, after: { items: received.length } });
    }
    if (lostLines.length > 0) {
      const task = await tx.storageQcTask.create({
        data: { taskNo: await nextTaskNo(tx), status: "pending_payment", ...base, fineSatang: input.fine!.amount, fineRemark: input.fine!.remark, createdAt: now },
      });
      await tx.storageQcTaskItem.createMany({
        data: lostLines.map(({ i, r }) => ({ taskId: task.id, requestId: i.requestId, itemId: i.itemId, serial: i.serial, qty: r.LOST, status: "lost", resLost: r.LOST })),
      });
      await audit(tx, { actorId, action: "storage.return.received", subjectType: "storage_qc_task", subjectId: task.id, after: { lost: lostLines.length, fineSatang: input.fine!.amount } });
      await notifyFine(tx, lostLines.map(({ i }) => i.requestId), task.taskNo, input.fine!.amount);
    }

    for (const { i, r } of plan) {
      if (r.NOT_BROUGHT > 0) {
        await tx.storageOwedItem.update({ where: { id: i.id }, data: { qty: r.NOT_BROUGHT, status: "not_brought", notBroughtAt: i.notBroughtAt ?? now } });
      } else {
        await tx.storageOwedItem.delete({ where: { id: i.id } });
      }
    }
    return {
      queued: received.reduce((n, { r }) => n + r.RETURNED, 0),
      lost: lostLines.reduce((n, { r }) => n + r.LOST, 0),
    };
  });
}
