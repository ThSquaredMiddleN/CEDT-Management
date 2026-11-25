import { audit } from "../../core/audit.js";
import { groupsOfStudent } from "../../core/groups.js";
import { findUserByStudentNo } from "../../core/users.js";
import type { Tx } from "../../db.js";
import { conflict, notFound, validation } from "../../lib/errors.js";
import { findOwnedRequest, groupIdsOfStudent, notifyRequest, ownedWhere, requireStudentNo, type StorageActor } from "./access.js";
import { applyIssue, availableSerialsOf, createOwed, issuableQty, itemByCode, itemTotal, releaseHolds, sweep, validateIssue, type IssueLine } from "./stock.js";
import { readDefaultDueAt } from "./settings.js";
import { storageTx } from "./tx.js";
import { PERSONAL_GROUP, groupType, requestInclude, requestView, type BorrowRequestView, type RequestRow, type StudentGroupView } from "./views.js";

export async function nextRequestNo(tx: Tx): Promise<string> {
  const [row] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('storage_request_seq') AS n`;
  return `REQ-B-${row!.n}`;
}

export async function loadRow(tx: Tx, requestNo: string): Promise<RequestRow> {
  const r = await tx.storageRequest.findUnique({ where: { requestNo }, include: requestInclude });
  if (!r) throw notFound("ไม่พบคำขอ");
  return r;
}

/** Adds what each line could be issued now (pool + its own hold) and the serials handed out on it. */
export async function decorate(tx: Tx, r: RequestRow): Promise<BorrowRequestView> {
  const view = requestView(r);
  for (const [i, line] of r.lines.entries()) {
    const v = view.items[i]!;
    v.available = await issuableQty(tx, line.itemId, r.id);
    if (line.item.isUnique) {
      v.availableSerials = await availableSerialsOf(tx, line.itemId);
      v.issuedSerials = (
        await tx.storageUnit.findMany({ where: { itemId: line.itemId, requestId: r.id }, orderBy: { serial: "asc" }, select: { serial: true } })
      ).map((u) => u.serial);
    }
  }
  return view;
}

/** The student's active groups (type from the course name) plus the built-in personal choice. */
export async function studentGroups(tx: Tx, studentNo: string): Promise<StudentGroupView[]> {
  const groups = await groupsOfStudent(tx, studentNo);
  const courseIds = groups.flatMap((g) => (g.courseId ? [g.courseId] : []));
  const courses = await tx.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, name: true } });
  const nameOf = new Map(courses.map((c) => [c.id, c.name]));
  return [
    ...groups.map((g) => ({ id: g.id, label: g.name, type: groupType({ type: g.type, course: g.courseId ? { name: nameOf.get(g.courseId) ?? "" } : null }) })),
    { ...PERSONAL_GROUP },
  ];
}

export const listRequests = () =>
  storageTx(async (tx) =>
    (await tx.storageRequest.findMany({ include: requestInclude, orderBy: { createdAt: "asc" } })).map(requestView),
  );

export const getRequest = (requestNo: string) => storageTx(async (tx) => decorate(tx, await loadRow(tx, requestNo)));

/**
 * Walk-in at the counter: a request that is already picked up, so the items are owed at once.
 * A student without an account is stored by number; their owed items appear once they log in.
 */
export function walkIn(actorId: string, input: { studentId: string; groupId: string; lines: IssueLine[] }) {
  return storageTx(async (tx, now) => {
    let groupId: string | null = null;
    if (input.groupId !== PERSONAL_GROUP.id) {
      if (!(await groupIdsOfStudent(tx, input.studentId, true)).includes(input.groupId)) throw validation("นิสิตไม่ได้อยู่ในกลุ่มนี้");
      groupId = input.groupId;
    }
    const issued = input.lines.filter((l) => l.qty > 0);
    if (issued.length === 0) throw validation("ตะกร้าว่าง");
    const items = await validateIssue(tx, issued);
    const user = await findUserByStudentNo(tx, input.studentId);
    const req = await tx.storageRequest.create({
      data: {
        requestNo: await nextRequestNo(tx),
        channel: "walk_in",
        groupId,
        requestedById: user?.id ?? null,
        studentNo: input.studentId,
        status: "closed",
        createdAt: now,
        pickedUpAt: now,
        dueAt: await readDefaultDueAt(tx),
        lines: { create: issued.map((l) => ({ itemId: items.get(l.itemId)!.id, reqQty: l.qty, issuedQty: l.qty })) },
      },
    });
    await applyIssue(tx, issued, items, req.id);
    await createOwed(tx, req.id, now);
    const swept = await sweep(tx);
    await audit(tx, { actorId, action: "storage.walk_in.created", subjectType: "storage_request", subjectId: req.id, after: { lines: issued.length } });
    return { swept, requestId: req.requestNo };
  });
}

const LOCATION_LABEL = { locker: "ตู้ Smart Locker", counter: "เคาน์เตอร์ภาควิชาฯ", lab: "ห้องปฏิบัติการ (Lab)" } as const;
const bangkok = (d: Date) => d.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" });

export const getMe = (user: StorageActor) =>
  storageTx(async (tx) => {
    const studentNo = requireStudentNo(user);
    return { studentId: studentNo, name: user.name, groups: await studentGroups(tx, studentNo) };
  });

/** Requests of all my groups plus my personal ones, newest first. */
export const listMyRequests = (user: StorageActor) =>
  storageTx(async (tx) => {
    const rows = await tx.storageRequest.findMany({
      where: await ownedWhere(tx, requireStudentNo(user)),
      include: requestInclude,
      orderBy: { createdAt: "desc" },
    });
    const views: BorrowRequestView[] = [];
    for (const r of rows) views.push(await decorate(tx, r));
    return views;
  });

/**
 * A line may ask for more than is available (it waits in the queue) but never more than the item's total.
 * A request with nothing issuable is swept to UNFULFILLED at once.
 */
export function createRequest(user: StorageActor, input: { groupId: string; items: { itemId: string; qty: number }[] }) {
  return storageTx(async (tx, now) => {
    const studentNo = requireStudentNo(user);
    let groupId: string | null = null;
    if (input.groupId !== PERSONAL_GROUP.id) {
      if (!(await groupIdsOfStudent(tx, studentNo, true)).includes(input.groupId)) throw validation("คุณไม่ได้อยู่ในกลุ่มนี้");
      groupId = input.groupId;
    }
    if (input.items.length === 0) throw validation("ยังไม่ได้เลือกอุปกรณ์");
    if (new Set(input.items.map((l) => l.itemId)).size !== input.items.length) throw validation("รายการอุปกรณ์ซ้ำกัน");
    const lines: { itemId: string; reqQty: number }[] = [];
    for (const l of input.items) {
      const item = await itemByCode(tx, l.itemId);
      const total = await itemTotal(tx, item);
      if (!Number.isInteger(l.qty) || l.qty < 1 || l.qty > total) throw validation(`จำนวน ${item.name} ต้องอยู่ระหว่าง 1–${total}`);
      lines.push({ itemId: item.id, reqQty: l.qty });
    }
    const created = await tx.storageRequest.create({
      data: { requestNo: await nextRequestNo(tx), channel: "click_collect", groupId, requestedById: user.id, studentNo, createdAt: now, lines: { create: lines } },
    });
    await sweep(tx);
    const row = await loadRow(tx, created.requestNo);
    await audit(tx, { actorId: user.id, action: "storage.request.created", subjectType: "storage_request", subjectId: created.id, after: { status: row.status, lines: lines.length } });
    return requestView(row);
  });
}

export function cancelMyRequest(user: StorageActor, requestNo: string) {
  return storageTx(async (tx, now) => {
    const req = await findOwnedRequest(tx, requireStudentNo(user), requestNo);
    if (req.status !== "open" && req.status !== "unfulfilled") throw conflict("ยกเลิกได้เฉพาะคำขอที่ยังไม่ได้จ่ายของ");
    await tx.storageRequest.update({
      where: { id: req.id },
      data: { status: "cancelled", cancelReason: "by_student", restockFlaggedAt: null, restockExpiresAt: null },
    });
    await releaseHolds(tx, req.id, now);
    await audit(tx, { actorId: user.id, action: "storage.request.cancelled", subjectType: "storage_request", subjectId: req.id, before: { status: req.status }, after: { status: "cancelled" } });
    return requestView(await loadRow(tx, requestNo));
  });
}

/** A member reopens a request flagged "stock is back"; it keeps its original queue place. */
export function reopenMyRequest(user: StorageActor, requestNo: string) {
  return storageTx(async (tx) => {
    const req = await findOwnedRequest(tx, requireStudentNo(user), requestNo);
    if (req.status === "cancelled" && req.cancelReason === "restock_expired") throw conflict("หมดเวลาเปิดคำขอแล้ว");
    if (req.status !== "unfulfilled") throw conflict("คำขอนี้ไม่ได้อยู่ในสถานะ UNFULFILLED");
    if (!req.restockExpiresAt) throw conflict("คำขอนี้ยังไม่มีการแจ้งสต็อกกลับมา");
    const lines = await tx.storageRequestLine.findMany({ where: { requestId: req.id } });
    let issuable = false;
    for (const l of lines) if ((await issuableQty(tx, l.itemId, req.id)) > 0) issuable = true;
    if (!issuable) throw conflict("สต็อกหมดแล้ว หรือหมดเวลาจองอุปกรณ์");
    // Holds stay until issued or expired; createdAt keeps the queue place.
    await tx.storageRequest.update({ where: { id: req.id }, data: { status: "open", restockFlaggedAt: null, restockExpiresAt: null } });
    await audit(tx, { actorId: user.id, action: "storage.request.reopened", subjectType: "storage_request", subjectId: req.id, before: { status: "unfulfilled" }, after: { status: "open" } });
    return requestView(await loadRow(tx, requestNo));
  });
}

async function confirmPickup(tx: Tx, req: { id: string; requestNo: string; status: string }, actorId: string, now: Date) {
  if (req.status !== "ready_for_pickup") throw conflict("คำขอนี้ยังไม่พร้อมให้รับของ");
  await tx.storageRequest.update({ where: { id: req.id }, data: { status: "closed", pickedUpAt: now, dueAt: await readDefaultDueAt(tx) } });
  await createOwed(tx, req.id, now);
  await audit(tx, { actorId, action: "storage.request.picked_up", subjectType: "storage_request", subjectId: req.id, before: { status: "ready_for_pickup" }, after: { status: "closed" } });
  return requestView(await loadRow(tx, req.requestNo));
}

export const pickupMyRequest = (user: StorageActor, requestNo: string) =>
  storageTx(async (tx, now) => confirmPickup(tx, await findOwnedRequest(tx, requireStudentNo(user), requestNo), user.id, now));

/** Staff fallback for counter and lab pickups. */
export const staffPickup = (actorId: string, requestNo: string) =>
  storageTx(async (tx, now) => confirmPickup(tx, await loadRow(tx, requestNo), actorId, now));

/** Click & Collect: partial fulfilment allowed; the request becomes READY_FOR_PICKUP. */
export function issueRequest(
  actorId: string,
  requestNo: string,
  lines: IssueLine[],
  pickup: { pickupAt: string; location: "locker" | "counter" | "lab"; remark: string },
) {
  return storageTx(async (tx) => {
    const req = await loadRow(tx, requestNo);
    if (req.status !== "open") throw conflict("คำขอนี้ไม่ได้อยู่ในสถานะ OPEN");
    const issued = lines.filter((l) => l.qty > 0);
    if (issued.length === 0) throw validation("ยังไม่ได้จ่ายอุปกรณ์ชิ้นใดเลย");
    for (const l of issued) {
      const line = req.lines.find((x) => x.item.code === l.itemId);
      if (!line) throw validation(`อุปกรณ์ ${l.itemId} ไม่อยู่ในคำขอนี้`);
      if (l.qty > line.reqQty) throw validation(`จำนวนจ่าย ${line.item.name} เกินจำนวนที่ขอ (${line.reqQty})`);
    }
    const items = await validateIssue(tx, issued, req.id);
    await applyIssue(tx, issued, items, req.id);
    for (const l of issued) {
      await tx.storageRequestLine.update({ where: { requestId_itemId: { requestId: req.id, itemId: items.get(l.itemId)!.id } }, data: { issuedQty: l.qty } });
    }
    const pickupAt = new Date(pickup.pickupAt);
    const updated = await tx.storageRequest.update({
      where: { id: req.id },
      data: { status: "ready_for_pickup", pickupAt, pickupLocation: pickup.location, pickupRemark: pickup.remark },
    });
    const swept = await sweep(tx);
    await audit(tx, { actorId, action: "storage.request.issued", subjectType: "storage_request", subjectId: req.id, before: { status: "open" }, after: { status: "ready_for_pickup", lines: issued.length } });
    await notifyRequest(tx, updated, "storage.pickup_ready", `คำขอ ${requestNo} พร้อมรับแล้ว ที่${LOCATION_LABEL[pickup.location]} ${bangkok(pickupAt)}`);
    return { swept };
  });
}

/** Staff decline a request before anything is issued. The reason is shown to the student. */
export function rejectRequest(actorId: string, requestNo: string, reason: string) {
  return storageTx(async (tx, now) => {
    const text = reason.trim();
    if (!text) throw validation("กรุณาระบุเหตุผลที่ปฏิเสธ");
    const req = await loadRow(tx, requestNo);
    if (req.status !== "open" && req.status !== "unfulfilled") throw conflict("ปฏิเสธได้เฉพาะคำขอที่ยังไม่ได้จ่ายของ");
    const updated = await tx.storageRequest.update({
      where: { id: req.id },
      data: { status: "rejected", rejectReason: text, rejectedById: actorId, rejectedAt: now, restockFlaggedAt: null, restockExpiresAt: null },
    });
    await releaseHolds(tx, req.id, now);
    await audit(tx, { actorId, action: "storage.request.rejected", subjectType: "storage_request", subjectId: req.id, before: { status: req.status }, after: { status: "rejected" }, note: text });
    await notifyRequest(tx, updated, "storage.request_rejected", `คำขอ ${requestNo} ถูกปฏิเสธ: ${text}`);
    return requestView(await loadRow(tx, requestNo));
  });
}

export function setDue(actorId: string, requestNo: string, dueAt: number) {
  return storageTx(async (tx) => {
    const req = await loadRow(tx, requestNo);
    if (req.status !== "closed") throw conflict("แก้กำหนดคืนได้เฉพาะคำขอที่รับของแล้ว");
    if (!Number.isFinite(dueAt) || dueAt < (req.pickedUpAt?.getTime() ?? 0)) throw validation("กำหนดคืนต้องไม่ก่อนวันที่รับของ");
    await tx.storageRequest.update({ where: { id: req.id }, data: { dueAt: new Date(dueAt) } });
    await audit(tx, { actorId, action: "storage.request.due_changed", subjectType: "storage_request", subjectId: req.id, before: { dueAt: req.dueAt?.toISOString() ?? null }, after: { dueAt: new Date(dueAt).toISOString() } });
    return requestView(await loadRow(tx, requestNo));
  });
}

/** Counter lookup: works for a student with no account, through their group memberships. */
export const lookupStudent = (studentNo: string) =>
  storageTx(async (tx) => {
    const user = await findUserByStudentNo(tx, studentNo);
    if (!user && (await groupIdsOfStudent(tx, studentNo)).length === 0 && (await tx.storageRequest.count({ where: { studentNo } })) === 0) {
      throw notFound("ไม่พบรหัสนิสิตนี้");
    }
    return { studentId: studentNo, name: user?.name ?? studentNo, groups: await studentGroups(tx, studentNo) };
  });
