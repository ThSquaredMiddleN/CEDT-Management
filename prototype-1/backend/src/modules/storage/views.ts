import type { Prisma } from "@prisma/client";

/** Shapes returned by the API. They match prototype-1/frontend/src/features/storage/types/index.ts. */

export const PERSONAL_GROUP = { id: "personal", label: "ส่วนตัว", type: "Personal" } as const;

export interface StudentGroupView {
  id: string;
  label: string;
  type: string;
}
export interface StudentView {
  studentId: string;
  name: string;
  groups: StudentGroupView[];
}

export interface InventoryItemView {
  id: string;
  name: string;
  isUnique: boolean;
  available: number;
  reserved: number;
  qc: number;
  damaged: number;
  lost: number;
  total: number;
  availableSerials?: string[];
}
export type CatalogItemView = Pick<InventoryItemView, "id" | "name" | "isUnique" | "available" | "total">;

export interface BorrowRequestItemView {
  itemId: string;
  name: string;
  isUnique: boolean;
  reqQty: number;
  issuedQty: number;
  available?: number;
  availableSerials?: string[];
  issuedSerials?: string[];
}
export interface BorrowRequestView {
  id: string;
  type: string;
  groupId: string;
  group: string;
  user: string;
  studentId: string;
  channel: "CLICK_COLLECT" | "WALK_IN";
  status: string;
  createdAt: number;
  restock?: { flaggedAt: number; expiresAt: number };
  cancelReason?: string;
  rejectReason?: string;
  rejectedAt?: number;
  pickup?: { pickupAt: string; location: "locker" | "counter" | "lab"; remark: string };
  pickedUpAt?: number;
  dueAt?: number;
  items: BorrowRequestItemView[];
}

export interface PendingReturnItemView {
  id: string;
  itemId: string;
  name: string;
  isUnique: boolean;
  qty: number;
  serialNumber?: string;
  owedStatus: "OWED" | "NOT_BROUGHT";
  notBroughtAt?: number;
  requestId: string;
  groupId: string;
  group: string;
  dueAt: number;
}

export interface QCRequestView {
  id: string;
  type: string;
  group: string;
  user: string;
  status: string;
  fineAmount: number;
  fineRemark: string;
  items: {
    id: string;
    itemId: string;
    name: string;
    isUnique: boolean;
    qty: number;
    serialNumber?: string;
    status: string;
    results?: { AVAILABLE: number; DAMAGED: number; LOST: number };
  }[];
  slip?: { amount: number; transferredAt: string; refCode: string };
}

const ms = (d: Date | null | undefined): number | undefined => (d ? d.getTime() : undefined);
const upper = (s: string) => s.toUpperCase();

/** "Course - <name>" for a course group, "Custom" for clubs and projects, "Personal" for none. */
export function groupType(group: { type: string; course?: { name: string } | null } | null): string {
  if (!group || group.type === "personal") return "Personal";
  if (group.type === "course_section") return `Course - ${group.course?.name ?? ""}`.trim();
  return "Custom";
}

export const requestInclude = {
  group: { include: { course: { select: { name: true } } } },
  requestedBy: { select: { name: true } },
  lines: { include: { item: true }, orderBy: { item: { code: "asc" } } },
} satisfies Prisma.StorageRequestInclude;
export type RequestRow = Prisma.StorageRequestGetPayload<{ include: typeof requestInclude }>;

export function requestView(r: RequestRow): BorrowRequestView {
  return {
    id: r.requestNo,
    type: groupType(r.group),
    groupId: r.groupId ?? PERSONAL_GROUP.id,
    group: r.group?.name ?? PERSONAL_GROUP.label,
    user: r.requestedBy?.name ?? r.studentNo,
    studentId: r.studentNo,
    channel: upper(r.channel) as BorrowRequestView["channel"],
    status: upper(r.status),
    createdAt: r.createdAt.getTime(),
    restock: r.restockExpiresAt
      ? { flaggedAt: (r.restockFlaggedAt ?? r.restockExpiresAt).getTime(), expiresAt: r.restockExpiresAt.getTime() }
      : undefined,
    cancelReason: r.cancelReason ? upper(r.cancelReason) : undefined,
    rejectReason: r.rejectReason ?? undefined,
    rejectedAt: ms(r.rejectedAt),
    pickup: r.pickupAt && r.pickupLocation
      ? { pickupAt: r.pickupAt.toISOString(), location: r.pickupLocation, remark: r.pickupRemark ?? "" }
      : undefined,
    pickedUpAt: ms(r.pickedUpAt),
    dueAt: ms(r.dueAt),
    items: r.lines.map((l) => ({ itemId: l.item.code, name: l.item.name, isUnique: l.item.isUnique, reqQty: l.reqQty, issuedQty: l.issuedQty })),
  };
}

export const owedInclude = {
  item: true,
  request: { include: { group: { select: { name: true } } } },
} satisfies Prisma.StorageOwedItemInclude;
export type OwedRow = Prisma.StorageOwedItemGetPayload<{ include: typeof owedInclude }>;

export function owedView(o: OwedRow): PendingReturnItemView {
  return {
    id: o.id,
    itemId: o.item.code,
    name: o.item.name,
    isUnique: o.item.isUnique,
    qty: o.qty,
    serialNumber: o.serial ?? undefined,
    owedStatus: upper(o.status) as PendingReturnItemView["owedStatus"],
    notBroughtAt: ms(o.notBroughtAt),
    requestId: o.request.requestNo,
    groupId: o.request.groupId ?? PERSONAL_GROUP.id,
    group: o.request.group?.name ?? PERSONAL_GROUP.label,
    dueAt: o.request.dueAt?.getTime() ?? 0,
  };
}

/** Not brought first, then overdue, then soonest due; ties keep the given order. */
export function sortOwed(items: PendingReturnItemView[], now: number): PendingReturnItemView[] {
  const rank = (i: PendingReturnItemView) => (i.owedStatus === "NOT_BROUGHT" ? 0 : i.dueAt < now ? 1 : 2);
  return [...items].sort((a, b) => rank(a) - rank(b) || a.dueAt - b.dueAt);
}

export const qcInclude = { items: { include: { item: true }, orderBy: [{ serial: { sort: "asc", nulls: "last" } }, { id: "asc" }] } } satisfies Prisma.StorageQcTaskInclude;
export type QcRow = Prisma.StorageQcTaskGetPayload<{ include: typeof qcInclude }>;

export function qcView(t: QcRow): QCRequestView {
  return {
    id: t.taskNo,
    type: t.kind,
    group: t.groupLabel,
    user: t.requesterLabel,
    status: upper(t.status),
    fineAmount: t.fineSatang,
    fineRemark: t.fineRemark,
    items: t.items.map((i) => ({
      id: i.id,
      itemId: i.item.code,
      name: i.item.name,
      isUnique: i.item.isUnique,
      qty: i.qty,
      serialNumber: i.serial ?? undefined,
      status: upper(i.status),
      results: i.status === "pending_test" ? undefined : { AVAILABLE: i.resAvailable, DAMAGED: i.resDamaged, LOST: i.resLost },
    })),
    slip:
      t.slipAmountSatang !== null
        ? { amount: t.slipAmountSatang, transferredAt: t.slipTransferredAt ?? "", refCode: t.slipRef ?? "" }
        : undefined,
  };
}
