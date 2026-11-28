import { UserCircleIcon } from "@heroicons/react/24/outline";
import { ChevronsUpDown, LogOut, MessageCircle, Settings } from "lucide-react";
import { useState } from "react";
import { Link, Outlet } from "react-router-dom";

import { Sidebar, type SidebarItem } from "@/components/Sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { can, isStaff } from "./permissions";
import { signOut } from "./signOut";

export function AppShell({
  sidebarItems,
  showGuestProfile = false,
}: {
  sidebarItems: SidebarItem[];
  showGuestProfile?: boolean;
}) {
  const { user } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const displayName = [user?.titlePrefix, user?.name]
    .filter(Boolean)
    .join(" ");
  const sidebarName = user ? displayName : "Staff TA";
  const sidebarRole = user ? (user.isStudent ? "นิสิต" : isStaff(user) ? "เจ้าหน้าที่" : "ผู้ใช้") : "admin";

  const profileMenu = user ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="เมนูบัญชีผู้ใช้"
          title={sidebarCollapsed ? displayName : undefined}
          className={
            sidebarCollapsed
              ? "flex size-9 items-center justify-center rounded-lg transition-colors hover:bg-slate-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
              : "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-slate-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
          }
        >
          <Avatar className="size-8 shrink-0 rounded-lg bg-brand-primary text-white">
            <AvatarFallback className="rounded-lg bg-brand-primary text-[11px] font-bold leading-[16.5px] text-white">
              {initials(user.name || "?")}
            </AvatarFallback>
          </Avatar>
          {!sidebarCollapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate font-body text-body-sm-emphasize text-grey-900">{sidebarName}</p>
                <p className="truncate font-body text-body-xs text-grey-400">{sidebarRole}</p>
              </div>
              <ChevronsUpDown className="size-4 shrink-0 text-grey-400" aria-hidden="true" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent side="right" align="end" sideOffset={8} className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold">{displayName}</span>
          <span className="text-xs font-normal text-neutral-500">{user.email}</span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {can(user, "line.use") && (
          <DropdownMenuItem asChild>
            <Link to="/admin/line">
              <MessageCircle className="size-4" />
              LINE
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuItem disabled>
          <UserCircleIcon className="size-4" />
          Profile
        </DropdownMenuItem>

        <DropdownMenuItem disabled>
          <Settings className="size-4" />
          Settings
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="text-status-danger-fg focus:bg-status-danger-bg focus:text-status-danger-fg"
          onSelect={() => setLogoutDialogOpen(true)}
        >
          <LogOut className="size-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  const sidebarFooter = user ? (
    sidebarCollapsed ? (
      <>
        <NotificationBell variant="sidebar" />
        {profileMenu}
      </>
    ) : (
      <>
        {profileMenu}
        <NotificationBell variant="sidebar" />
      </>
    )
  ) : showGuestProfile ? (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Avatar className="size-8 shrink-0 rounded-lg bg-brand-primary text-white">
        <AvatarFallback className="rounded-lg bg-brand-primary text-[11px] font-bold leading-[16.5px] text-white">
          JD
        </AvatarFallback>
      </Avatar>
      {!sidebarCollapsed && (
        <div className="min-w-0 flex-1">
          <p className="truncate font-body text-body-sm-emphasize text-grey-900">{sidebarName}</p>
          <p className="truncate font-body text-body-xs text-grey-400">{sidebarRole}</p>
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="flex min-h-screen bg-white">
      <Sidebar
        items={sidebarItems}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((collapsed) => !collapsed)}
        footer={sidebarFooter}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="min-h-0 flex-1">
          <Outlet />
        </main>
      </div>

      <Dialog
        open={logoutDialogOpen}
        onOpenChange={(open) => {
          if (!signingOut) setLogoutDialogOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ออกจากระบบ</DialogTitle>
            <DialogDescription>คุณต้องการออกจากระบบใช่หรือไม่?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={signingOut}
              onClick={() => setLogoutDialogOpen(false)}
            >
              ยกเลิก
            </Button>
            <Button
              type="button"
              disabled={signingOut}
              className="bg-status-danger-solid text-white hover:bg-status-danger-fg"
              onClick={async () => {
                setSigningOut(true);
                try {
                  await signOut();
                } finally {
                  setSigningOut(false);
                }
              }}
            >
              {signingOut ? "กำลังออกจากระบบ…" : "ออกจากระบบ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}