import { useQueryClient } from "@tanstack/react-query";
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
import { initials } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { useAuth } from "./AuthProvider";

const PROTOTYPE_NAV = [
  { to: "/calendar", label: "Calendar", icon: CalendarIcon },
  { to: "/requests/new", label: "New Booking", icon: PlusSquare },
  { to: "/requests", label: "My Requests", icon: ClipboardList },
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/data", label: "Master Data", icon: Database },
];

const SCHEDULE_NAV = [
  { to: "/schedule/a", label: "A" },
  { to: "/schedule/b", label: "B" },
];

export function AppShell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const signOut = async () => {
    await logout().catch(() => undefined);
    qc.clear();
    navigate("/login", { replace: true });
  };

  const displayName = [user?.titlePrefix, user?.name]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="min-h-screen bg-white">

      <header className="flex h-16 items-center justify-between border-b border-neutral-200 bg-white px-8">

        <div className="flex items-center gap-10">

          <Brand />

          <div className="group relative">

            <button
              type="button"
              className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-950"
            >
              Prototype1
              <ChevronDown className="size-4 transition-transform group-hover:rotate-180" />
            </button>

            <div
              className="
                invisible absolute left-0 top-full z-50
                w-56 translate-y-1
                rounded-xl border border-neutral-200
                bg-white p-2
                opacity-0 shadow-lg
                transition-all duration-150
                group-hover:visible
                group-hover:translate-y-0
                group-hover:opacity-100
              "
            >
              {PROTOTYPE_NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/admin"}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                      isActive
                        ? "bg-neutral-900 font-medium text-neutral-50"
                        : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950",
                    )
                  }
                >
                  <item.icon className="size-4" />
                  {item.label}
                </NavLink>
              ))}
            </div>

          </div>

          <div className="group relative">

            <button
              type="button"
              className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-950"
            >
              Schedule
              <ChevronDown className="size-4 transition-transform group-hover:rotate-180" />
            </button>

            <div
              className="
                invisible absolute left-0 top-full z-50
                w-56 translate-y-1
                rounded-xl border border-neutral-200
                bg-white p-2
                opacity-0 shadow-lg
                transition-all duration-150
                group-hover:visible
                group-hover:translate-y-0
                group-hover:opacity-100
              "
            >
              {SCHEDULE_NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                      isActive
                        ? "bg-neutral-900 font-medium text-neutral-50"
                        : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950",
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>

          </div>

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

                <DropdownMenuItem onSelect={() => void signOut()}>
                  <LogOut className="size-4" />
                  Log out
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