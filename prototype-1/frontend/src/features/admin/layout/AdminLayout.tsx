import {
  ArchiveBoxIcon,
  CalendarIcon,
  ChatBubbleLeftRightIcon,
  CpuChipIcon,
  DocumentMagnifyingGlassIcon,
  DocumentTextIcon,
  GlobeAltIcon,
  HomeIcon,
  KeyIcon,
  MegaphoneIcon,
  NewspaperIcon,
} from "@heroicons/react/24/outline";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/app/AuthProvider";
import { AppShell } from "@/app/AppShell";
import { can } from "@/app/permissions";
import type { SidebarItem } from "@/components/Sidebar";

const RECEIPTS_PATH = "/admin/receipts";

/** `permission` hides the item from users who cannot open it. Items without one show to all staff. */
const ADMIN_SIDEBAR_ITEMS: (SidebarItem & { permission?: string })[] = [
  { label: "หน้าหลัก", icon: <HomeIcon />, to: "/admin" },
  { label: "จัดการประกาศ", icon: <MegaphoneIcon />, to: "/admin/announcements", permission: "announcements.view" },
  { label: "จัดการข่าวประชาสัมพันธ์", icon: <NewspaperIcon />, to: "/admin/news", permission: "news.view" },
  { label: "จัดการห้องเรียน", icon: <CalendarIcon />, permission: "bookings.view" },
  { label: "ลด - ถอนรายวิชา", icon: <DocumentTextIcon />, to: "/admin/course-change", permission: "course_change.view" },
  { label: "จัดการคลังอุปกรณ์", icon: <CpuChipIcon />, to: "/admin/storage", permission: "storage.view" },
  { label: "รายการอุปกรณ์", icon: <ArchiveBoxIcon />, to: "/admin/storage/inventory", permission: "storage.view" },
  { label: "Receipt checks", icon: <DocumentMagnifyingGlassIcon />, to: RECEIPTS_PATH, permission: "receipts.view" },
  { label: "การแจ้งเตือน LINE", icon: <ChatBubbleLeftRightIcon />, to: "/admin/line", permission: "line.use" },
  { label: "สิทธิ์ผู้ใช้", icon: <KeyIcon />, to: "/admin/access", permission: "core.permissions.manage" },
  // Back to the portal (news, booking, course change for students, LINE settings).
  { label: "หน้าเว็บหลัก", icon: <GlobeAltIcon />, to: "/" },
];

export function AdminLayout() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const items = ADMIN_SIDEBAR_ITEMS.filter((item) => !item.permission || can(user, item.permission)).map(
    ({ permission: _permission, ...item }) => ({
      ...item,
      active:
        // "/" would prefix-match every path, so the portal link and the admin home match exactly.
        item.to === "/admin" || item.to === "/"
          ? pathname === item.to
          : item.to
            ? item.to === "/admin/storage"
              ? pathname === item.to ||
                (pathname.startsWith(item.to + "/") && !pathname.startsWith("/admin/storage/inventory"))
              : pathname.startsWith(item.to)
            : false,
    }),
  );

  return (
    <AppShell
      sidebarItems={items}
      showGuestProfile
      hideHeader={
        pathname.startsWith("/admin/announcements") ||
        pathname.startsWith("/admin/news")
      }
    />
  );
}
