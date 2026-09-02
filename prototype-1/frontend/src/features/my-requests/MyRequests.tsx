import { CalendarDays, Plus, Repeat, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useBookings,
  useCancelBooking,
  useMarkNotificationsRead,
  useNotifications,
} from "@/api/endpoints";
import type { Booking } from "@/api/types";
import { useToast } from "@/app/toast";
import { EmptyState, ErrorCard, SkeletonRow, Spinner, StatusBadge } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { dayName } from "@/lib/formatters";
import { cn } from "@/lib/utils";

const todayISO = () => new Date().toISOString().slice(0, 10);

/** An approved booking can only be cancelled while it still has a future occurrence. */
const isFuture = (b: Booking): boolean => {
  const last = b.bookingType === "one_off" ? b.oneOffDate : b.endDate;
  return !!last && last >= todayISO();
};

export function MyRequests() {
  const navigate = useNavigate();
  const toast = useToast();

  // `mine: true` scopes the list to the current user's own requests (staff see all otherwise).
  const list = useBookings({ mine: "true", sort: "createdAt", order: "desc" });
  const notifications = useNotifications();
  const markRead = useMarkNotificationsRead();
  const cancel = useCancelBooking();

  const [confirming, setConfirming] = useState<Booking | null>(null);
  const [reason, setReason] = useState("");

  const items = list.data?.items ?? [];

  // Opening the page clears the unread dots for the requests shown here.
  useEffect(() => {
    const unreadIds = (notifications.data?.items ?? [])
      .filter((n) => !n.isRead && n.bookingId)
      .map((n) => n.id);
    if (unreadIds.length > 0) markRead.mutate({ ids: unreadIds });
    // Runs once per mount — re-running on every notification tick would fight the poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications.isSuccess]);

  const isWithdraw = confirming?.status === "pending";

  const confirmCancel = () => {
    if (!confirming) return;
    cancel.mutate(
      { id: confirming.id, reason: isWithdraw ? undefined : reason.trim() },
      {
        onSuccess: () => {
          toast(isWithdraw ? "Request withdrawn" : "Booking cancelled — admin notified");
          setConfirming(null);
          setReason("");
        },
        onError: () => toast("Could not complete that action."),
      },
    );
  };

  return (
    <main className="px-12 py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">My Requests</h1>
            <p className="text-sm text-neutral-500">
              Track the status of your room booking requests, newest first.
            </p>
          </div>
          <Button onClick={() => navigate("/requests/new")}>
            <Plus className="size-4" />
            New Request
          </Button>
        </div>

        {list.isError && <ErrorCard onRetry={() => void list.refetch()} />}

        <Card className="flex flex-col gap-4 p-6">
          {list.isPending && (
            <div className="flex flex-col gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonRow key={i} className="h-12" />
              ))}
            </div>
          )}

          {list.isSuccess && items.length === 0 && (
            <EmptyState
              title="No requests yet."
              action={
                <Button onClick={() => navigate("/requests/new")}>
                  <Plus className="size-4" />
                  New Request
                </Button>
              }
            />
          )}

          {list.isSuccess && items.length > 0 && (
            <>
              <div className="grid grid-cols-12 gap-4 text-xs uppercase tracking-wide text-neutral-500">
                <div className="col-span-3">Course</div>
                <div className="col-span-2">Room</div>
                <div className="col-span-2">Day / Time</div>
                <div className="col-span-2">Recurrence</div>
                <div className="col-span-3 text-right">Status &amp; Actions</div>
              </div>

              {items.map((b) => (
                <div key={b.id} className="flex flex-col">
                  <Separator />
                  <div className="grid grid-cols-12 items-start gap-4 py-5">
                    <div className="col-span-3 flex items-start gap-2">
                      <span
                        className={cn(
                          "mt-1.5 size-2 shrink-0 rounded-full",
                          b.hasUnreadStatusChange ? "bg-neutral-900" : "bg-transparent",
                        )}
                      />
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium">{b.courseCode ?? b.title}</span>
                        <span className="text-xs text-neutral-500">
                          {b.title}
                          {b.section ? ` · Sec ${b.section}` : ""}
                        </span>
                      </div>
                    </div>

                    <div className="col-span-2 flex flex-col gap-0.5">
                      <span className="text-sm">{b.roomName}</span>
                      <span className="text-xs text-neutral-500">
                        {b.roomType} · {b.roomCapacity} seats
                      </span>
                    </div>

                    <div className="col-span-2 flex flex-col gap-0.5">
                      <span className="text-sm">
                        {b.bookingType === "one_off" ? b.oneOffDate : dayName(b.dayOfWeek)}
                      </span>
                      <span className="text-xs text-neutral-500">
                        {b.startTime}–{b.endTime}
                      </span>
                    </div>

                    <div className="col-span-2 flex items-center gap-1.5 text-sm text-neutral-500">
                      {b.bookingType === "recurring" ? (
                        <>
                          <Repeat className="size-3.5" /> Weekly
                        </>
                      ) : (
                        <>
                          <CalendarDays className="size-3.5" /> One-off
                        </>
                      )}
                    </div>

                    <div className="col-span-3 flex flex-col items-end gap-2">
                      <StatusBadge status={b.status} />

                      {b.status === "rejected" && b.rejectReason && (
                        <p className="max-w-[220px] text-right text-xs text-neutral-500">
                          Reason: {b.rejectReason}
                        </p>
                      )}

                      {b.status === "pending" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => setConfirming(b)}
                        >
                          <RotateCcw className="size-3" />
                          Withdraw
                        </Button>
                      )}

                      {b.status === "approved" && isFuture(b) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => setConfirming(b)}
                        >
                          <X className="size-3" />
                          Cancel
                        </Button>
                      )}

                      {b.status === "rejected" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => navigate(`/requests/new?clone=${b.id}`)}
                        >
                          <RotateCcw className="size-3" />
                          Rebook
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              <Separator />
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <span>
                  Showing {items.length} of {list.data?.total ?? items.length} requests
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-neutral-900" />
                  Unread status change
                </span>
              </div>
            </>
          )}
        </Card>
      </div>

      <Dialog open={!!confirming} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isWithdraw ? "Withdraw this request?" : "Cancel this booking?"}</DialogTitle>
            <DialogDescription>
              {isWithdraw
                ? "It will be removed from the admin's queue."
                : "The slot will be freed and the CEDT admin will be notified."}
            </DialogDescription>
          </DialogHeader>

          {!isWithdraw && (
            <div className="flex flex-col gap-2">
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why are you cancelling? (required)"
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              Keep it
            </Button>
            <Button
              onClick={confirmCancel}
              disabled={cancel.isPending || (!isWithdraw && reason.trim().length === 0)}
            >
              {cancel.isPending && <Spinner />}
              {isWithdraw ? "Withdraw request" : "Cancel booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
