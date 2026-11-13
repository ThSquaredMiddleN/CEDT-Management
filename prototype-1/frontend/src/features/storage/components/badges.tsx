import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BorrowStatus, QCItemStatus, QCRequestStatus } from "../types";

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
