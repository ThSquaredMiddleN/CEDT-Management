import type { Prisma } from "@prisma/client";
import { notify } from "../../core/notify.js";
import type { Tx } from "../../db.js";
import { forbidden, notFound } from "../../lib/errors.js";

/** The part of SessionUser the storage services need. */
export interface StorageActor {
  id: string;
  name: string;
  studentNo: string | null;
}

/** Storage's student features find "my" data by student number. */
export function requireStudentNo(user: StorageActor): string {
  if (!user.studentNo) throw forbidden("บัญชีนี้ไม่มีรหัสนิสิต");
  return user.studentNo;
}

/** Active groups the student belongs to (by student number; works without an account). */
export async function groupIdsOfStudent(tx: Tx, studentNo: string): Promise<string[]> {
  const rows = await tx.groupMember.findMany({ where: { studentNo, group: { isActive: true } }, select: { groupId: true } });
  return rows.map((r) => r.groupId);
}

/** Requests the student owns: their personal ones plus every request of their groups. */
export async function ownedWhere(tx: Tx, studentNo: string): Promise<Prisma.StorageRequestWhereInput> {
  return { OR: [{ groupId: null, studentNo }, { groupId: { in: await groupIdsOfStudent(tx, studentNo) } }] };
}

/** The request if the student owns it; otherwise 404, so others' requests are not revealed. */
export async function findOwnedRequest(tx: Tx, studentNo: string, requestNo: string) {
  const req = await tx.storageRequest.findFirst({ where: { AND: [{ requestNo }, await ownedWhere(tx, studentNo)] } });
  if (!req) throw notFound("ไม่พบคำขอ");
  return req;
}

type RequestOwner = { id: string; requestNo: string; groupId: string | null; studentNo: string; requestedById: string | null };

/** Users to notify about a request: the requester plus every group member (or the owner) who has an account. */
export async function recipientsOf(tx: Tx, req: RequestOwner): Promise<string[]> {
  const studentNos = req.groupId
    ? (await tx.groupMember.findMany({ where: { groupId: req.groupId }, select: { studentNo: true } })).map((m) => m.studentNo)
    : [req.studentNo];
  const users = await tx.user.findMany({ where: { studentNo: { in: studentNos }, isActive: true }, select: { id: true } });
  return [...new Set([...users.map((u) => u.id), ...(req.requestedById ? [req.requestedById] : [])])];
}

export async function notifyRequest(tx: Tx, req: RequestOwner, type: string, message: string): Promise<void> {
  await notify(tx, {
    userIds: await recipientsOf(tx, req),
    type,
    module: "storage",
    subjectId: req.id,
    message,
    link: `/student/storage?tab=requests&id=${req.requestNo}`,
  });
}
