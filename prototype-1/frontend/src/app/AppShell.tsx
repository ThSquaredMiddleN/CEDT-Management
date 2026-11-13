import { useQueryClient } from "@tanstack/react-query";
import { UserCircleIcon } from "@heroicons/react/24/outline";
import { LogOut, Settings } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { logout } from "@/api/endpoints";
import { Sidebar, type SidebarItem } from "@/components/Sidebar";
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
import { useAuth } from "./AuthProvider";

export function AppShell({
  sidebarItems,
  showGuestProfile = false,
}: {
  sidebarItems: SidebarItem[];
  showGuestProfile?: boolean;
}) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const signOut = async () => {
    await logout().catch(() => undefined);
    qc.clear();
    navigate("/login", { replace: true });
  };

  const displayName = [user?.titlePrefix, user?.name]
    .filter(Boolean)
    .join(" ");
  const sidebarName = user ? displayName : "Staff TA";
  const sidebarRole = user?.role ?? "admin";

  return (
    <div className="flex min-h-screen bg-white">
      <Sidebar
        items={sidebarItems}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((collapsed) => !collapsed)}
        footer={
          user || showGuestProfile ? (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Avatar className="size-8 shrink-0 rounded-lg bg-brand-primary text-white">
                <AvatarFallback className="rounded-lg bg-brand-primary text-[11px] font-bold leading-[16.5px] text-white">
                  {user ? initials(user.name || "?") : "JD"}
                </AvatarFallback>
              </Avatar>
              {!sidebarCollapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate font-body text-body-sm-emphasize text-grey-900">{sidebarName}</p>
                  <p className="truncate font-body text-body-xs text-grey-400">{sidebarRole}</p>
                </div>
              )}
            </div>
          ) : null
        }
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {pathname !== "/admin" && (
          <header className="flex h-[63px] shrink-0 items-center justify-end gap-2 border-b border-neutral-200 bg-white px-6">
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
                  type="button"
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
          )}
          </header>
        )}
        <main className="min-h-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}