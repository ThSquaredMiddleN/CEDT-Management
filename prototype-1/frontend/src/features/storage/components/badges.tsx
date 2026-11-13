import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BorrowStatus, QCItemStatus, QCRequestStatus } from "../types";

export function IndexTypeBadge({ isUnique }: { isUnique: boolean }) {
  return (
    <span
      className={cn(
        "rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        isUnique
          ? "border-purple-200 bg-purple-100 text-purple-700"
          : "border-neutral-200 bg-neutral-100 text-neutral-600",
      )}
    >
      {isUnique ? "Unique" : "Bulk"}
    </span>
  );
}

const TASK_STYLES: Record<string, string> = {
  OPEN: "border-blue-200 bg-blue-100 text-blue-700",
  READY_FOR_PICKUP: "border-teal-200 bg-teal-100 text-teal-700",
  CLOSED: "border-green-200 bg-green-100 text-green-700",
  UNFULFILLED: "border-red-200 bg-red-100 text-red-700",
  PENDING_PAYMENT: "border-orange-200 bg-orange-100 text-orange-700",
};

export function TaskStatusBadge({ status }: { status: BorrowStatus | QCRequestStatus }) {
  return (
    <Badge variant="outline" className={cn("px-2 py-0.5 text-[10px] font-bold", TASK_STYLES[status])}>
      {status}
    </Badge>
  );
}

const ITEM_STYLES: Record<QCItemStatus, { label: string; cls: string }> = {
  PENDING_TEST: { label: "รอตรวจ", cls: "border-blue-200 bg-blue-50 text-blue-600" },
  AVAILABLE: { label: "พร้อมใช้", cls: "border-green-200 bg-green-50 text-green-600" },
  DAMAGED: { label: "ชำรุด", cls: "border-orange-200 bg-orange-50 text-orange-600" },
  LOST: { label: "สูญหาย", cls: "border-red-200 bg-red-50 text-red-600" },
};

export function ItemStatusBadge({ status }: { status: QCItemStatus }) {
  const s = ITEM_STYLES[status];
  return (
    <Badge variant="outline" className={cn("px-3 py-1 text-xs font-bold", s.cls)}>
      {s.label}
    </Badge>
  );
}
