import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Bell, Check, Clock, MoveRight, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMarkNotificationsRead, useNotifications } from "@/api/endpoints";
import type { AppNotification } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const ICONS: Record<string, typeof Check> = {
  request_approved: Check,
  request_rejected: X,
  request_submitted: Clock,
  booking_moved: MoveRight,
  booking_cancelled_by_instructor: X,
  request_withdrawn: X,
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data } = useNotifications();
  const markRead = useMarkNotificationsRead();

  const unread = data?.unreadCount ?? 0;
  const items = data?.items ?? [];

  const openNotification = (n: AppNotification) => {
    if (!n.isRead) markRead.mutate({ ids: [n.id] });
    setOpen(false);
    void qc.invalidateQueries({ queryKey: ["bookings"] });
    // Decisions on the caller's own requests land on My Requests; everything else (new
    // submissions, withdrawals, cancellations) is queue work on the Dashboard.
    const toMyRequests = n.type === "request_approved" || n.type === "request_rejected";
    navigate(toMyRequests ? "/requests" : "/admin");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-neutral-900 text-[10px] font-semibold text-neutral-50">
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <button
              onClick={() => markRead.mutate({ all: true })}
              className="text-xs text-neutral-500 underline underline-offset-4 hover:text-neutral-950"
            >
              Mark all read
            </button>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-neutral-500">No notifications yet.</p>
          )}

          {items.map((n) => {
            const Icon = ICONS[n.type] ?? Bell;
            return (
              <button
                key={n.id}
                onClick={() => openNotification(n)}
                className={cn(
                  "flex w-full items-start gap-3 border-b border-neutral-200 px-4 py-3 text-left transition-colors last:border-0 hover:bg-neutral-100",
                  !n.isRead && "bg-neutral-100/50",
                )}
              >
                {!n.isRead ? (
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-neutral-900" />
                ) : (
                  <span className="mt-1.5 size-2 shrink-0" />
                )}
                <Icon className="mt-0.5 size-4 shrink-0 text-neutral-500" />
                <span className="flex-1">
                  <span className="block text-xs leading-snug text-neutral-950">{n.message}</span>
                  <span className="mt-0.5 block text-[10px] text-neutral-500">
                    {formatDistanceToNow(parseISO(n.createdAt), { addSuffix: true })}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
