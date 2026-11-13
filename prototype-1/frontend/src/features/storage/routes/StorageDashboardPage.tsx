import { Barcode, ClipboardCheck, PackageOpen, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { EmptyState, SkeletonRow } from "@/components/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useInventory } from "../api/hooks";
import { IndexTypeBadge } from "../components/badges";
import { StoragePage } from "../components/layout";

function ActionCard({ to, icon, title, desc, tone }: { to: string; icon: ReactNode; title: string; desc: string; tone: string }) {
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-4 rounded-xl p-4 text-left text-white shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2",
        tone,
      )}
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white/20 [&>svg]:size-6">
        {icon}
      </span>
      <span>
        <span className="block font-body text-body-sm-emphasize">{title}</span>
        <span className="block font-body text-body-xs text-white/80">{desc}</span>
      </span>
    </Link>
  );
}

export function StorageDashboardPage() {
  const { data, isLoading, isError } = useInventory();

  return (
    <StoragePage
      wide
      title="จัดการคลังอุปกรณ์"
      subtitle="การจัดการคลังอุปกรณ์และรายการคำขอต่างๆ"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ActionCard to="/admin/storage/borrow" icon={<PackageOpen />} title="Click & Collect" desc="รายการสั่งเบิกล่วงหน้า" tone="bg-blue-600 hover:bg-blue-700" />
        <ActionCard to="/admin/storage/borrow/walk-in" icon={<Barcode />} title="Scan-to-Cart" desc="จ่ายหน้าเคาน์เตอร์" tone="bg-indigo-600 hover:bg-indigo-700" />
        <ActionCard to="/admin/storage/return" icon={<Users />} title="Face-to-Face" desc="รับคืนหน้าเคาน์เตอร์" tone="bg-teal-600 hover:bg-teal-700" />
        <ActionCard to="/admin/storage/qc" icon={<ClipboardCheck />} title="QC & Liability" desc="รอตรวจสภาพ / ปรับเงิน" tone="bg-orange-600 hover:bg-orange-700" />
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <Table className="whitespace-nowrap">
          <TableHeader>
            <TableRow>
              <TableHead>Item ID</TableHead>
              <TableHead>ชื่ออุปกรณ์</TableHead>
              <TableHead className="text-center">ประเภท Index</TableHead>
              <TableHead className="text-center">Available</TableHead>
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
                  <TableCell colSpan={9}>
                    <SkeletonRow />
                  </TableCell>
                </TableRow>
              ))}
            {data?.map((i) => (
              <TableRow key={i.id} className="hover:bg-neutral-50">
                <TableCell className="font-mono text-grey-400">{i.id}</TableCell>
                <TableCell className="font-semibold text-grey-900">{i.name}</TableCell>
                <TableCell className="text-center"><IndexTypeBadge isUnique={i.isUnique} /></TableCell>
                <TableCell className="bg-green-50/50 text-center font-bold text-green-600">{i.available}</TableCell>
                <TableCell className="text-center font-bold text-blue-500">{i.qc}</TableCell>
                <TableCell className="text-center font-bold text-orange-500">{i.damaged}</TableCell>
                <TableCell className="text-center font-bold text-red-500">{i.lost}</TableCell>
                <TableCell className="bg-neutral-50 text-center font-bold text-grey-700">{i.total}</TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-bold",
                      i.available > 0
                        ? "border-green-200 bg-green-50 text-green-600"
                        : "border-red-200 bg-red-50 text-red-600",
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
