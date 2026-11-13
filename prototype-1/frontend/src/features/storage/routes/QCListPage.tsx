import { ChevronRight, Receipt } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState, SkeletonRow } from "@/components/states";
import { cn } from "@/lib/utils";
import { useQCRequests } from "../api/hooks";
import { TaskStatusBadge } from "../components/badges";
import { StoragePage } from "../components/layout";

export function QCListPage() {
  const { data, isLoading, isError } = useQCRequests();

  return (
    <StoragePage title="รายการรอตรวจสอบสภาพ (QC List)" backTo="/admin/storage" backLabel="กลับหน้า Dashboard">
      <div className="space-y-3">
        {isLoading && Array.from({ length: 3 }, (_, i) => <SkeletonRow key={i} className="h-20" />)}
        {isError && <EmptyState title="โหลดรายการไม่สำเร็จ" />}
        {data?.map((r) => (
          <Link
            key={r.id}
            to={`/admin/storage/qc/${r.id}`}
            className={cn(
              "flex items-center justify-between rounded-xl border border-neutral-200 p-4 transition-shadow hover:border-brand-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary",
              r.status === "CLOSED" ? "bg-neutral-50 opacity-70" : "bg-white",
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-center gap-3">
                <span className="font-body text-body-md-emphasize text-grey-900">{r.id}</span>
                <TaskStatusBadge status={r.status} />
              </div>
              <p className="font-body text-body-sm text-grey-400">
                คืนโดย: <span className="font-semibold text-grey-700">{r.user}</span> | กลุ่ม:{" "}
                <span className="font-semibold text-brand-primary">{r.group}</span>
              </p>
              {r.fineAmount > 0 && (
                <p className="mt-2 flex items-center gap-1 font-body text-body-sm-emphasize text-red-600">
                  <Receipt className="size-4" aria-hidden="true" /> ยอดรอชำระ: {r.fineAmount.toLocaleString()} บาท
                </p>
              )}
            </div>
            {r.status !== "CLOSED" && (
              <span className="flex size-10 items-center justify-center rounded-full bg-neutral-100">
                <ChevronRight className="size-4 text-grey-200" aria-hidden="true" />
              </span>
            )}
          </Link>
        ))}
      </div>
    </StoragePage>
  );
}
