import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BorrowRequest, BorrowStatus, QCItemStatus, QCRequestStatus } from "../types";
import { DAY_MS, daysBetween, dueTone, formatDate } from "./dates";

export function IndexTypeBadge({ isUnique }: { isUnique: boolean }) {
  return (
    <span
      className={cn(
        "rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        isUnique
          ? "border-status-info-border bg-status-info-bg text-status-info-fg"
          : "border-grey-200 bg-grey-100 text-grey-400",
      )}
    >
      {isUnique ? "Unique" : "Bulk"}
    </span>
  );
}

const TASK_STYLES: Record<string, string> = {
  OPEN: "border-status-info-border bg-status-info-bg text-status-info-fg",
  READY_FOR_PICKUP: "border-brand-primary bg-brand-primary text-white",
  CLOSED: "border-status-success-border bg-status-success-bg text-status-success-fg",
  UNFULFILLED: "border-status-danger-border bg-status-danger-bg text-status-danger-fg",
  PENDING_PAYMENT: "border-status-warning-border bg-status-warning-bg text-status-warning-fg",
  CANCELLED: "border-grey-200 bg-grey-100 text-grey-400",
  REJECTED: "border-status-danger-border bg-status-danger-bg text-status-danger-fg",
};

export function TaskStatusBadge({ status }: { status: BorrowStatus | QCRequestStatus }) {
  return (
    <Badge variant="outline" className={cn("px-2 py-0.5 text-[10px] font-bold", TASK_STYLES[status])}>
      {status}
    </Badge>
  );
}

const ITEM_STYLES: Record<QCItemStatus, { label: string; cls: string }> = {
  PENDING_TEST: { label: "รอตรวจ", cls: "border-status-info-border bg-status-info-bg text-status-info-fg" },
  AVAILABLE: { label: "พร้อมใช้", cls: "border-status-success-border bg-status-success-bg text-status-success-fg" },
  DAMAGED: { label: "ชำรุด", cls: "border-status-warning-border bg-status-warning-bg text-status-warning-fg" },
  LOST: { label: "สูญหาย", cls: "border-status-danger-border bg-status-danger-bg text-status-danger-fg" },
};

export function ItemStatusBadge({ status }: { status: QCItemStatus }) {
  const s = ITEM_STYLES[status];
  return (
    <Badge variant="outline" className={cn("px-3 py-1 text-xs font-bold", s.cls)}>
      {s.label}
    </Badge>
  );
}

const TONE = {
  info: "border-status-info-border bg-status-info-bg text-status-info-fg",
  success: "border-status-success-border bg-status-success-bg text-status-success-fg",
  warning: "border-status-warning-border bg-status-warning-bg text-status-warning-fg",
  danger: "border-status-danger-border bg-status-danger-bg text-status-danger-fg",
  grey: "border-grey-200 bg-grey-100 text-grey-400",
};

const REQUEST_PILLS: Record<BorrowStatus, { label: string; cls: string }> = {
  OPEN: { label: "รอดำเนินการ", cls: TONE.info },
  READY_FOR_PICKUP: { label: "พร้อมรับ", cls: TONE.success },
  UNFULFILLED: { label: "ของหมด", cls: TONE.warning },
  CANCELLED: { label: "ยกเลิก", cls: TONE.grey },
  REJECTED: { label: "ถูกปฏิเสธ", cls: TONE.danger },
  CLOSED: { label: "รับของแล้ว", cls: TONE.grey },
};

type PillRequest = Pick<BorrowRequest, "status" | "restock" | "cancelReason">;

export function requestPillLabel(req: PillRequest): string {
  if (req.status === "UNFULFILLED" && req.restock) return "ของหมด · มีของแล้ว";
  if (req.status === "CANCELLED") return req.cancelReason === "RESTOCK_EXPIRED" ? "ยกเลิก · หมดเวลา" : "ยกเลิก · โดยผู้ขอ";
  return REQUEST_PILLS[req.status].label;
}

/** Student-facing request status, in Thai. */
export function RequestStatusPill({ req }: { req: PillRequest }) {
  return (
    <Badge variant="outline" className={cn("px-2 py-0.5 text-[10px] font-bold", REQUEST_PILLS[req.status].cls)}>
      {requestPillLabel(req)}
    </Badge>
  );
}

/** Due date with colour: grey > 14 days, amber <= 14 days, red overdue or not brought. */
export function DueBadge({ dueAt, now, notBrought = false }: { dueAt: number; now: number; notBrought?: boolean }) {
  const tone = dueTone(dueAt, now, notBrought);
  const label =
    now > dueAt
      ? `เลยกำหนด ${Math.max(1, Math.floor((now - dueAt) / DAY_MS))} วัน`
      : notBrought
        ? `${formatDate(dueAt)} · ค้างส่ง`
        : `${formatDate(dueAt)} · อีก ${daysBetween(now, dueAt)} วัน`;
  return (
    <Badge
      variant="outline"
      className={cn(
        "whitespace-nowrap px-2 py-0.5 text-[10px] font-bold",
        tone === "late" ? TONE.danger : tone === "soon" ? TONE.warning : TONE.grey,
      )}
    >
      {label}
    </Badge>
  );
}
