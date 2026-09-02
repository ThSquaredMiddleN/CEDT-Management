import { format } from "date-fns";
import { Activity, CalendarCheck, CalendarSearch, Check, ClipboardList, Clock, X } from "lucide-react";
import { Fragment, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, type ConflictDetail } from "@/api/client";
import { useApproveBooking, useBookings, useCalendar, useRejectBooking } from "@/api/endpoints";
import type { Booking } from "@/api/types";
import { useToast } from "@/app/toast";
import { EmptyState, ErrorCard, SkeletonRow, Spinner } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { submittedAt, whenLabel } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { RejectDialog } from "./RejectDialog";

function KpiCard({
  title,
  value,
  caption,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  caption: string;
  icon: typeof ClipboardList;
}) {
  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex items-start justify-between">
        <span className="text-sm text-neutral-500">{title}</span>
        <div className="flex size-9 items-center justify-center rounded-lg bg-neutral-100">
          <Icon className="size-4 text-neutral-950" />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-4xl font-bold tracking-tight">{value}</span>
        <span className="text-xs text-neutral-500">{caption}</span>
      </div>
    </Card>
  );
}

/** The first requested date of a booking — where "View on calendar" should land. */
const firstDate = (b: Booking): string =>
  b.bookingType === "one_off" ? (b.oneOffDate ?? "") : (b.startDate ?? "");

export function AdminDashboard() {
  const navigate = useNavigate();
  const toast = useToast();

  const [rejecting, setRejecting] = useState<Booking | null>(null);
  // Rows whose Approve hit a 409: Approve is disabled and the clash is explained inline.
  const [rowConflicts, setRowConflicts] = useState<Record<string, ConflictDetail[]>>({});
  const [pendingRow, setPendingRow] = useState<string | null>(null);

  const queue = useBookings(
    { status: "pending", sort: "createdAt", order: "desc" },
    { refetchInterval: 45_000 },
  );

  const today = format(new Date(), "yyyy-MM-dd");
  const todayCal = useCalendar({ from: today, to: today, status: ["approved"] });

  const approve = useApproveBooking();
  const reject = useRejectBooking();

  const items = queue.data?.items ?? [];
  const pendingCount = queue.data?.total ?? 0;

  const onApprove = (b: Booking) => {
    setPendingRow(b.id);
    approve.mutate(b.id, {
      onSuccess: () => {
        toast("Approved — instructor notified");
        setRowConflicts((c) => {
          const next = { ...c };
          delete next[b.id];
          return next;
        });
      },
      onError: (err) => {
        if (err instanceof ApiError && err.code === "CONFLICT") {
          setRowConflicts((c) => ({ ...c, [b.id]: (err.details as ConflictDetail[]) ?? [] }));
          return;
        }
        if (err instanceof ApiError && err.code === "INVALID_TRANSITION") {
          toast("This request was already actioned.");
          return;
        }
        toast("Could not approve the request.");
      },
      onSettled: () => setPendingRow(null),
    });
  };

  const onReject = (reason: string) => {
    if (!rejecting) return;
    const id = rejecting.id;
    reject.mutate(
      { id, reason },
      {
        onSuccess: () => {
          toast("Rejected — instructor notified");
          setRejecting(null);
        },
        onError: () => toast("Could not reject the request."),
      },
    );
  };

  return (
    <main className="flex flex-col gap-8 p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Admin Dashboard</h1>
        <p className="text-sm text-neutral-500">
          Review pending requests and monitor room activity.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <KpiCard
          title="Pending Requests"
          value={queue.isPending ? "—" : pendingCount}
          caption="Awaiting your review"
          icon={ClipboardList}
        />
        <KpiCard
          title="Today's Bookings"
          value={todayCal.isPending ? "—" : (todayCal.data?.occurrences.length ?? 0)}
          caption="Approved for today"
          icon={CalendarCheck}
        />
        {/* Prototype: a placeholder figure, per the guide's stretch-goal note. */}
        <KpiCard title="Room Utilization" value="67%" caption="This week" icon={Activity} />
      </div>

      <Card className="flex flex-col gap-6 p-6">
        <CardHeader className="flex-row items-start justify-between">
          <div className="flex flex-col gap-1.5">
            <CardTitle>Pending-Approval Queue</CardTitle>
            <CardDescription>Newest requests first. Approve or reject with one click.</CardDescription>
          </div>
          <Badge variant="secondary" className="gap-1.5 rounded-full">
            <Clock className="size-3" />
            {pendingCount} pending
          </Badge>
        </CardHeader>

        {queue.isError && <ErrorCard onRetry={() => void queue.refetch()} />}

        {queue.isPending && (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonRow key={i} className="h-10" />
            ))}
          </div>
        )}

        {queue.isSuccess && items.length === 0 && (
          <EmptyState
            title="All caught up — no pending requests."
            action={
              <Button variant="outline" onClick={() => navigate("/calendar")}>
                Open calendar
              </Button>
            }
          />
        )}

        {queue.isSuccess && items.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-neutral-200">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Instructor</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead>Day/Time</TableHead>
                  <TableHead>Recurrence</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {items.map((b, i) => {
                  const conflicts = rowConflicts[b.id];
                  const blocked = !!conflicts;

                  return (
                    <Fragment key={b.id}>
                      <TableRow
                        className={cn(i % 2 === 1 && "bg-neutral-100/50", blocked && "border-b-0")}
                      >
                        <TableCell className="text-xs text-neutral-500">
                          {submittedAt(b.createdAt)}
                        </TableCell>
                        <TableCell className="font-medium">{b.instructorName}</TableCell>
                        <TableCell>{b.courseCode ?? b.title}</TableCell>
                        <TableCell>{b.roomName}</TableCell>
                        <TableCell className="whitespace-nowrap">{whenLabel(b)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="rounded-full font-normal">
                            {b.bookingType === "recurring" ? "Weekly" : "One-off"}
                          </Badge>
                        </TableCell>
                        <TableCell>{b.studentCount}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              disabled={blocked || pendingRow === b.id}
                              onClick={() => onApprove(b)}
                            >
                              {pendingRow === b.id ? (
                                <Spinner className="size-3" />
                              ) : (
                                <Check className="size-3" />
                              )}
                              Approve
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setRejecting(b)}>
                              <X className="size-3" />
                              Reject
                            </Button>
                            <button
                              onClick={() =>
                                navigate(
                                  `/calendar?date=${firstDate(b)}&ghost=${b.id}&from=queue`,
                                )
                              }
                              className="flex items-center gap-1 text-xs text-neutral-950 underline underline-offset-4 hover:text-neutral-700"
                            >
                              <CalendarSearch className="size-3" />
                              View
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {blocked && (
                        <TableRow className={cn(i % 2 === 1 && "bg-neutral-100/50")}>
                          <TableCell colSpan={8} className="pt-0">
                            <div className="rounded-lg border-2 border-neutral-950 bg-neutral-100 p-3 text-xs">
                              <span className="font-semibold">Cannot approve — </span>
                              {conflicts.length === 0
                                ? "the slot was taken by an earlier approval."
                                : `clashes with ${conflicts[0]!.existing.courseCode ?? conflicts[0]!.existing.title}, ${conflicts[0]!.roomName}, ${conflicts[0]!.existing.startTime}–${conflicts[0]!.existing.endTime}` +
                                  (conflicts.length > 1
                                    ? ` (and ${conflicts.length - 1} more date${conflicts.length > 2 ? "s" : ""}).`
                                    : ".")}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <RejectDialog
        open={!!rejecting}
        onOpenChange={(open) => !open && setRejecting(null)}
        isPending={reject.isPending}
        summary={
          rejecting
            ? `${rejecting.courseCode ?? rejecting.title} · ${rejecting.roomName} · ${whenLabel(rejecting)} · ${rejecting.instructorName}`
            : ""
        }
        // After a 409 the reason is pre-filled, so rejecting is one click.
        defaultReason={
          rejecting && rowConflicts[rejecting.id] ? "Slot taken by an earlier approval." : ""
        }
        onConfirm={onReject}
      />
    </main>
  );
}
