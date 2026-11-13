import { Button } from "@/components/ui/button";
import type { CcListResponse } from "@/api/courseChange";

export function RequestPagination({ pagination, onChange }: {
  pagination: CcListResponse["pagination"];
  onChange: (page: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 px-4 py-3 text-xs">
      <span aria-live="polite">{pagination.total} รายการ · หน้า {pagination.page}/{pagination.totalPages}</span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={pagination.page <= 1} onClick={() => onChange(pagination.page - 1)}>ก่อนหน้า</Button>
        <Button size="sm" variant="outline" disabled={pagination.page >= pagination.totalPages} onClick={() => onChange(pagination.page + 1)}>ถัดไป</Button>
      </div>
    </div>
  );
}
