import { Barcode, ChevronRight, ClipboardCheck, PackageOpen, Users } from "lucide-react";
import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/app/AuthProvider";
import { can } from "@/app/permissions";
import { cn } from "@/lib/utils";
import { useInventory } from "../api/hooks";
import { DefaultDueDateField } from "../components/DefaultDueDateField";
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
  const { user } = useAuth();
  const { data } = useInventory();

  return (
    <StoragePage
      wide
      title="จัดการคลังอุปกรณ์"
      subtitle="การจัดการคลังอุปกรณ์และรายการคำขอต่างๆ"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {user && can(user, "storage.manage.counter") && (
          <ActionCard to="/admin/storage/borrow" icon={<PackageOpen />} title="Click & Collect" desc="รายการสั่งเบิกล่วงหน้า" tone="bg-brand-primary hover:bg-button-primary-hover" />
        )}
        {user && can(user, "storage.manage.counter") && (
          <ActionCard to="/admin/storage/borrow/walk-in" icon={<Barcode />} title="Scan-to-Cart" desc="จ่ายหน้าเคาน์เตอร์" tone="bg-brand-primary hover:bg-button-primary-hover" />
        )}
        {user && can(user, "storage.manage.counter") && (
          <ActionCard to="/admin/storage/return" icon={<Users />} title="Face-to-Face" desc="รับคืนหน้าเคาน์เตอร์" tone="bg-brand-primary hover:bg-button-primary-hover" />
        )}
        {user && can(user, "storage.manage.qc") && (
          <ActionCard to="/admin/storage/qc" icon={<ClipboardCheck />} title="QC & Liability" desc="รอตรวจสภาพ / ปรับเงิน" tone="bg-brand-primary hover:bg-button-primary-hover" />
        )}
      </div>

      {user && can(user, "storage.manage.inventory") && <DefaultDueDateField />}

      <Link
        to="/admin/storage/inventory"
        className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-5 hover:border-brand-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
      >
        <span>
          <span className="block font-body text-body-md-emphasize text-grey-900">รายการอุปกรณ์</span>
          <span className="block font-body text-body-sm text-grey-400">
            {data ? `${data.length} รายการ · หมด ${data.filter((i) => i.available === 0).length} รายการ` : "กำลังโหลด…"}
          </span>
        </span>
        <ChevronRight className="size-4 text-grey-200" aria-hidden="true" />
      </Link>
    </StoragePage>
  );
}
