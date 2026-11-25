import { audit } from "../../core/audit.js";
import { groupsOfStudent } from "../../core/groups.js";
import { findUserByStudentNo } from "../../core/users.js";
import type { Tx } from "../../db.js";
import { notFound, validation } from "../../lib/errors.js";
import { groupIdsOfStudent } from "./access.js";
import { applyIssue, availableSerialsOf, createOwed, issuableQty, sweep, validateIssue, type IssueLine } from "./stock.js";
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
