import { EmptyState, SkeletonRow } from "@/components/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/app/AuthProvider";
import { can } from "@/app/permissions";
import { cn } from "@/lib/utils";
import { useInventory } from "../api/hooks";
import { AddItemDialog } from "../components/AddItemDialog";
import { IndexTypeBadge } from "../components/badges";
import { ItemImage } from "../components/ItemImage";
import { StoragePage } from "../components/layout";

export function InventoryPage() {
  const { user } = useAuth();
  const { data, isLoading, isError } = useInventory();

  return (
    <StoragePage wide title="รายการอุปกรณ์" backTo="/admin/storage" backLabel="กลับหน้า Dashboard">
      {user && can(user, "storage.manage.inventory") && (
        <div className="flex justify-end">
          <AddItemDialog />
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <Table className="whitespace-nowrap">
          <TableHeader>
            <TableRow>
              <TableHead>รูป</TableHead>
              <TableHead>Item ID</TableHead>
              <TableHead>ชื่ออุปกรณ์</TableHead>
              <TableHead className="text-center">ประเภท Index</TableHead>
              <TableHead className="text-center">Available</TableHead>
              <TableHead className="text-center">Reserved</TableHead>
              <TableHead className="text-center">QC</TableHead>
              <TableHead className="text-center">Damaged</TableHead>
              <TableHead className="text-center">Lost</TableHead>
              <TableHead className="text-center">Total</TableHead>
              <TableHead>สถานะ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 4 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={11}>
                    <SkeletonRow />
                  </TableCell>
                </TableRow>
              ))}
            {data?.map((i) => (
              <TableRow key={i.id} className="hover:bg-neutral-50">
                <TableCell><ItemImage name={i.name} className="size-10" /></TableCell>
                <TableCell className="font-mono text-grey-400">{i.id}</TableCell>
                <TableCell className="font-semibold text-grey-900">{i.name}</TableCell>
                <TableCell className="text-center"><IndexTypeBadge isUnique={i.isUnique} /></TableCell>
                <TableCell className="bg-status-success-bg text-center font-bold text-status-success-fg">{i.available}</TableCell>
                <TableCell className="text-center font-bold text-status-info-fg" title="กันไว้ให้คำขอที่สต็อกกลับมา (24 ชม.)">{i.reserved}</TableCell>
                <TableCell className="text-center font-bold text-status-info-fg">{i.qc}</TableCell>
                <TableCell className="text-center font-bold text-status-warning-fg">{i.damaged}</TableCell>
                <TableCell className="text-center font-bold text-status-danger-fg">{i.lost}</TableCell>
                <TableCell className="bg-neutral-50 text-center font-bold text-grey-700">{i.total}</TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-bold",
                      i.available > 0
                        ? "border-status-success-border bg-status-success-bg text-status-success-fg"
                        : "border-status-danger-border bg-status-danger-bg text-status-danger-fg",
                    )}
                  >
                    {i.available > 0 ? "พร้อมจ่าย" : "ของหมด"}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {isError && <EmptyState title="โหลดข้อมูลคลังไม่สำเร็จ" />}
      </div>
    </StoragePage>
  );
}
