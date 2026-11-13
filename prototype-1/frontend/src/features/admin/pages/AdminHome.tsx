import type { ReactNode } from "react";
import {
  CalendarIcon,
  CpuChipIcon,
  DocumentTextIcon,
  MegaphoneIcon,
  NewspaperIcon,
} from "@heroicons/react/24/outline";
import { MenuItem } from "@/features/admin/components/AdminMenuItem";

interface AdminMenuEntry {
  text: string;
  icon: ReactNode;
  to?: string;
}

interface MenuGroup {
  title: string;
  rowGap: string;
  items: AdminMenuEntry[];
}

const MENU_GROUPS: MenuGroup[] = [
  {
    title: "ทั่วไป",
    rowGap: "gap-y-4",
    items: [
      { text: "จัดการประกาศ", icon: <MegaphoneIcon />, to: "/admin/announcements" },
      { text: "จัดการข่าวประชาสัมพันธ์", icon: <NewspaperIcon /> },
      { text: "จัดการห้องเรียน", icon: <CalendarIcon />, to: "/admin/data" },
    ],
  },
  {
    title: "ทะเบียน",
    rowGap: "gap-y-6",
    items: [{ text: "ลด - ถอนรายวิชา", icon: <DocumentTextIcon />, to: "/admin/course-change" }],
  },
  {
    title: "อื่น ๆ",
    rowGap: "gap-y-6",
    items: [{ text: "ยืมอุปกรณ์", icon: <CpuChipIcon /> }],
  },
];

export function AdminHome() {
  return (
    <div className="min-h-full bg-background px-6 py-8 md:px-10 lg:px-16">
      <div className="flex flex-col gap-8">
        <h1 className="font-body text-header-sm-emphasize text-grey-900">เมนู</h1>
        <div className="flex flex-col gap-6">
          {MENU_GROUPS.map(({ title, items, rowGap }) => (
            <section key={title} className="flex flex-col gap-2">
              <h2 className="font-body text-body-md text-grey-400">{title}</h2>
              <div
                className={`grid grid-cols-1 gap-x-6 ${rowGap} md:grid-cols-2 lg:grid-cols-3`}
              >
                {items.map(({ text, icon, to }) => (
                  <MenuItem key={text} text={text} icon={icon} to={to} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
