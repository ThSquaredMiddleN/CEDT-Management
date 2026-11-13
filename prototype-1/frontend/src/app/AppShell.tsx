import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Calendar as CalendarIcon,
  ClipboardList,
  Database,
  LayoutDashboard,
  LogOut,
  PlusSquare,
  Settings,
  User as UserIcon,
  ChevronDown,
  FileMinus,
  Menu,
  type LucideIcon,
} from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { logout } from "@/api/endpoints";
import { Brand } from "@/components/Brand";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationBell } from "@/features/notifications/NotificationBell";
import { clearStudentDrafts } from "@/features/course-change/draft";
import { initials } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { useAuth } from "./AuthProvider";
import { clearSessionCache } from "./session";
import { useToast } from "./toast";

const PROTOTYPE_NAV = [
  { to: "/calendar", label: "Calendar", icon: CalendarIcon },
  { to: "/requests/new", label: "New Booking", icon: PlusSquare },
  { to: "/requests", label: "My Requests", icon: ClipboardList },
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/data", label: "Master Data", icon: Database },
];

const COURSE_CHANGE_NAV = [{ to: "/course-change", label: "ลด / ถอนรายวิชา", icon: FileMinus }];

const SCHEDULE_NAV = [
  { to: "/schedule/a", label: "A" },
  { to: "/schedule/b", label: "B" },
];

export function AppShell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try { await logout(); } catch {
      setSigningOut(false);
      toast("ออกจากระบบไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง");
      return;
    }
    try { clearStudentDrafts(sessionStorage); } catch { /* Storage may be disabled. */ }
    clearSessionCache(qc);
    navigate("/login", { replace: true });
  };

  const displayName = [user?.titlePrefix, user?.name]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="min-h-screen bg-white">

      <header className="flex h-16 items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-4 lg:gap-8">
          <Brand />
          <nav aria-label="เมนูหลัก" className="hidden items-center gap-2 md:flex">
            {user?.role !== "student" && <NavMenu label="Prototype1" items={PROTOTYPE_NAV} />}
            <NavMenu label="Course Change" items={COURSE_CHANGE_NAV} />
            <NavMenu label="Schedule" items={SCHEDULE_NAV} />
          </nav>
        </div>
        <div className="ml-auto md:hidden">
          <NavMenu label="เมนู" mobile items={[
            ...COURSE_CHANGE_NAV,
            ...(user?.role !== "student" ? PROTOTYPE_NAV : []),
            ...SCHEDULE_NAV,
          ]} />
        </div>

        <div className="flex items-center gap-2">

          {!user && (
            <Button asChild size="sm">
              <NavLink to="/login">Log in</NavLink>
            </Button>
          )}

          {user && <NotificationBell />}

          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="บัญชีผู้ใช้"
                  className="
                    rounded-full outline-none
                    focus-visible:ring-2
                    focus-visible:ring-neutral-950
                  "
                >
                  <Avatar className="size-9">
                    <AvatarFallback>
                      {initials(user?.name ?? "?")}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-56">

                <DropdownMenuLabel className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold">
                    {displayName}
                  </span>

                  <span className="text-xs font-normal text-neutral-500">
                    {user?.email}
                  </span>
                </DropdownMenuLabel>

                <DropdownMenuSeparator />

                <DropdownMenuItem disabled>
                  <UserIcon className="size-4" />
                  Profile
                </DropdownMenuItem>

                <DropdownMenuItem disabled>
                  <Settings className="size-4" />
                  Settings
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem disabled={signingOut} onSelect={() => void signOut()}>
                  <LogOut className="size-4" />
                  {signingOut ? "กำลังออกจากระบบ…" : "ออกจากระบบ"}
                </DropdownMenuItem>

              </DropdownMenuContent>
            </DropdownMenu>
          )}

        </div>

      </header>

      <Outlet />

    </div>
  );
}

function NavMenu({ label, items, mobile }: {
  label: string;
  items: { to: string; label: string; icon?: LucideIcon }[];
  mobile?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-950">
          {mobile && <Menu className="size-4" />}
          {label}
          {!mobile && <ChevronDown className="size-4" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={mobile ? "end" : "start"} className="w-56">
        {items.map((item) => (
          <DropdownMenuItem key={item.to} asChild>
            <NavLink to={item.to} end={item.to === "/admin"}
              className={({ isActive }) => cn(isActive && "bg-neutral-100 font-medium")}>
              {item.icon && <item.icon className="size-4" />}
              {item.label}
            </NavLink>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
