import { ChevronRight, User } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState, SkeletonRow } from "@/components/states";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useBorrowRequests } from "../api/hooks";
import { TaskStatusBadge } from "../components/badges";
import { StoragePage } from "../components/layout";

export function BorrowListPage() {
  const { data, isLoading, isError } = useBorrowRequests();

  return (
    <StoragePage
      title="รายการสั่งเบิกล่วงหน้า (Click & Collect)"
      backTo="/admin/storage"
      backLabel="กลับหน้า Dashboard"
    >
      <div className="flex justify-end">
        <Button asChild variant="outlined" size="medium">
          <Link to="/admin/storage/borrow/walk-in">จ่ายหน้าเคาน์เตอร์ (Walk-in)</Link>
        </Button>
      </div>

      <div className="space-y-3">
        {isLoading && Array.from({ length: 3 }, (_, i) => <SkeletonRow key={i} className="h-20" />)}
        {isError && <EmptyState title="โหลดรายการไม่สำเร็จ" />}
        {data?.length === 0 && <EmptyState title="ไม่มีคำขอ" />}
        {data?.map((r) => (
          <Link
            key={r.id}
            to={`/admin/storage/borrow/${r.id}`}
            className={cn(
              "flex items-center justify-between rounded-xl border border-neutral-200 p-4 transition-shadow hover:border-brand-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary",
              r.status === "OPEN" ? "bg-white" : "bg-neutral-50 opacity-70",
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-center gap-3">
                <span className="font-body text-body-md-emphasize text-grey-900">{r.id}</span>
                <TaskStatusBadge status={r.status} />
                {r.restock && (
                  <span className="rounded-full border border-status-info-border bg-status-info-bg px-2 py-0.5 text-[10px] font-bold text-status-info-fg">
                    สต็อกกลับมาแล้ว
                  </span>
                )}
              </div>
              <p className="font-body text-body-sm text-grey-400">
                ประเภท: <span className="font-semibold text-grey-700">{r.type}</span>
                <span className="mx-2 text-neutral-300">|</span>
                กลุ่ม: <span className="font-semibold text-brand-primary">{r.group}</span>
              </p>
              <p className="mt-1 flex items-center gap-1 font-body text-body-sm text-grey-400">
                <User className="size-3.5" aria-hidden="true" /> ผู้ยืม: {r.user}
              </p>
            </div>
            <span className="flex size-10 items-center justify-center rounded-full bg-neutral-100">
              <ChevronRight className="size-4 text-grey-200" aria-hidden="true" />
            </span>
          </Link>
        ))}
      </div>
    </StoragePage>
  );
}
