import { useQueryClient } from "@tanstack/react-query";
import { UserCircleIcon } from "@heroicons/react/24/outline";
import { LogOut, Settings } from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { logout } from "@/api/endpoints";
import { useAuth } from "@/app/AuthProvider";
import { Topbar, type TopbarItem } from "@/components/Topbar";
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
import { initials } from "@/lib/formatters";

const STUDENT_TOPBAR_ITEMS: TopbarItem[] = [
  { label: "หน้าแรก", to: "/" },
  { label: "ข่าวสาร" },
  { label: "ตารางเรียน - สอบ", to: "/calendar" },
  { label: "ลด - ถอนรายวิชา" },
  { label: "ยืมอุปกรณ์" },
  { label: "CU Links" },
];

export function StudentLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const items = STUDENT_TOPBAR_ITEMS.map((item) => ({
    ...item,
    active:
      item.to === "/"
        ? pathname === "/"
        : Boolean(item.to && (pathname === item.to || pathname.startsWith(`${item.to}/`))),
  }));

  const signOut = async () => {
    await logout().catch(() => undefined);
    qc.clear();
    navigate("/login", { replace: true });
  };

  const displayName = [user?.titlePrefix, user?.name].filter(Boolean).join(" ");

  const rightSlot = user ? (
    <>
      <NotificationBell variant="topbar" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="User menu"
            className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
          >
            <Avatar className="size-8">
              <AvatarFallback className="bg-brand-primary font-body text-[11px] font-bold leading-none text-white">
                {initials(user.name || "?")}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold">{displayName}</span>
            <span className="text-xs font-normal text-neutral-500">{user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled>
            <UserCircleIcon className="size-4" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <Settings className="size-4" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void signOut()}>
            <LogOut className="size-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  ) : (
    <Button
      asChild
      size="sm"
      className="bg-brand-primary font-body text-body-xs-emphasize text-white hover:bg-button-primary-hover"
    >
      <NavLink to="/login">Log in</NavLink>
    </Button>
  );

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Topbar items={items} rightSlot={rightSlot} />
      <main className="min-h-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
