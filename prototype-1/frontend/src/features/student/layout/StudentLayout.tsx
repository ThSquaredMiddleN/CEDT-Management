import { DocumentTextIcon } from "@heroicons/react/24/outline";
import { useLocation } from "react-router-dom";
import { AppShell } from "@/app/AppShell";
import type { SidebarItem } from "@/components/Sidebar";

const STUDENT_SIDEBAR_ITEMS: SidebarItem[] = [
  { label: "ลด - ถอนรายวิชา", icon: <DocumentTextIcon />, to: "/course-change" },
];

export function StudentLayout() {
  const { pathname } = useLocation();
  const items = STUDENT_SIDEBAR_ITEMS.map((item) => ({
    ...item,
    active: item.to ? pathname.startsWith(item.to) : false,
  }));

  return <AppShell sidebarItems={items} />;
}
