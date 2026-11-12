import {
  CalendarIcon,
  CpuChipIcon,
  DocumentMagnifyingGlassIcon,
  DocumentTextIcon,
  HomeIcon,
  MegaphoneIcon,
  NewspaperIcon,
} from "@heroicons/react/24/outline";
import { useLocation, useNavigate } from "react-router-dom";
import { AppShell } from "@/app/AppShell";
import type { SidebarItem } from "@/components/Sidebar";

const RECEIPTS_PATH = "/admin/receipts";

const ADMIN_SIDEBAR_ITEMS: SidebarItem[] = [
  { label: "หน้าหลัก", icon: <HomeIcon /> },
  { label: "จัดการประกาศ", icon: <MegaphoneIcon /> },
  { label: "จัดการข่าวประชาสัมพันธ์", icon: <NewspaperIcon /> },
  { label: "จัดการห้องเรียน", icon: <CalendarIcon /> },
  { label: "ลด - ถอนรายวิชา", icon: <DocumentTextIcon /> },
  { label: "ยืมอุปกรณ์", icon: <CpuChipIcon /> },
];

export function AdminLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const items: SidebarItem[] = [
    ...ADMIN_SIDEBAR_ITEMS.map((item) => ({
      ...item,
      active: item.label === "หน้าหลัก" && pathname === "/admin",
    })),
    {
      label: "Receipt checks",
      icon: <DocumentMagnifyingGlassIcon />,
      active: pathname.startsWith(RECEIPTS_PATH),
      onClick: () => navigate(RECEIPTS_PATH),
    },
  ];

  return <AppShell sidebarItems={items} showGuestProfile />;
}
