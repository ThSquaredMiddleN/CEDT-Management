import { addDays, format, parseISO, startOfWeek } from "date-fns";
import {
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  DoorOpen,
  User as UserIcon,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, type ConflictDetail } from "@/api/client";
import {
  useApproveBooking,
  useBooking,
  useBuildings,
  useCalendar,
  useCancelBooking,
  useMoveBooking,
  useRejectBooking,
  useRooms,
  useUsers,
} from "@/api/endpoints";
import type { CalendarOccurrence } from "@/api/types";
import { useAuth } from "@/app/AuthProvider";
import { useToast } from "@/app/toast";
import { RejectDialog } from "@/features/admin-dashboard/RejectDialog";
import { EmptyState, ErrorCard, StatusBadge } from "@/components/states";
import { Badge } from "@/components/ui/badge";
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
import { dateLabel } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { CalendarGrid, type ColumnModel, type GhostBlock } from "./CalendarGrid";
import { FilterDropdown } from "./FilterDropdown";
import { MoveDialog } from "./MoveDialog";

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const mondayOf = (d: Date) => startOfWeek(d, { weekStartsOn: 1 });

export function CalendarPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  // Single `staff` role: any logged-in user has full (formerly admin) powers; anonymous
  // visitors get a read-only calendar with no action controls.
  const isAdmin = !!user;

  // All view state lives in the URL, so a calendar view is shareable and survives reload.
  const view = (params.get("view") as "weekly" | "daily") ?? "weekly";
  const date = params.get("date") ?? iso(new Date());
  const buildingIds = params.get("bldg")?.split(",").filter(Boolean) ?? [];
  const roomIds = params.get("room")?.split(",").filter(Boolean) ?? [];
  const instructorIds = params.get("inst")?.split(",").filter(Boolean) ?? [];
  const statuses = params.get("status")?.split(",").filter(Boolean) ?? [];
  const ghostId = params.get("ghost");
  const fromQueue = params.get("from") === "queue";

  const [selected, setSelected] = useState<CalendarOccurrence | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveConflict, setMoveConflict] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);

  // Below the tablet breakpoint the weekly grid is unreadable — force the daily view.
  useEffect(() => {
    if (window.innerWidth <= 768 && view === "weekly") {
      setParams((p) => {
        p.set("view", "daily");
        return p;
      }, { replace: true });
    }
  }, [view, setParams]);

  const from = view === "weekly" ? iso(mondayOf(parseISO(date))) : date;
  const to = view === "weekly" ? iso(addDays(mondayOf(parseISO(date)), 6)) : date;

  const calendar = useCalendar({
    from,
    to,
    buildingIds: buildingIds.length ? buildingIds : undefined,
    roomIds: roomIds.length ? roomIds : undefined,
    instructorIds: instructorIds.length ? instructorIds : undefined,
    status: statuses.length ? statuses : undefined,
  });

  const rooms = useRooms({ active: "true" });
  const buildings = useBuildings();
  const instructors = useUsers({ role: "staff", active: "true" }, { enabled: !!user });

  const ghost = useBooking(ghostId);
  const approve = useApproveBooking();
  const reject = useRejectBooking();
  const move = useMoveBooking();
  const cancel = useCancelBooking();

  const occurrences = calendar.data?.occurrences ?? [];

  // Rooms available for the filter dropdown, scoped to the selected buildings.
  const roomOptions = useMemo(() => {
    const all = rooms.data?.items ?? [];
    const scoped = buildingIds.length
      ? all.filter((r) => buildingIds.includes(r.buildingId))
      : all;
    return scoped.map((r) => ({ value: r.id, label: `${r.name} (cap. ${r.capacity})` }));
  }, [rooms.data, buildingIds]);

  const setParam = (key: string, value: string | null, push = false) => {
    setParams(
      (p) => {
        if (value === null || value === "") p.delete(key);
        else p.set(key, value);
        return p;
      },
      { replace: !push },
    );
  };

  const toggleMulti = (key: string, current: string[], value: string) => {
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];

    setParams(
      (p) => {
        if (next.length === 0) p.delete(key);
        else p.set(key, next.join(","));

        // Narrowing the building filter can strand room selections in hidden buildings.
        if (key === "bldg") {
          const allowed = new Set(
            (rooms.data?.items ?? [])
              .filter((r) => next.length === 0 || next.includes(r.buildingId))
              .map((r) => r.id),
          );
          const keptRooms = roomIds.filter((id) => allowed.has(id));
          if (keptRooms.length === 0) p.delete("room");
          else p.set("room", keptRooms.join(","));
        }
        return p;
      },
      { replace: true },
    );
  };

  const shiftDate = (days: number) => {
    setParam("date", iso(addDays(parseISO(date), days)), true);
  };

  // ---------------------------------------------------------------- column model
  const model: ColumnModel = useMemo(() => {
    if (view === "daily") {
      const all = rooms.data?.items ?? [];
      const visible = all
        .filter((r) => (roomIds.length ? roomIds.includes(r.id) : true))
        .filter((r) => (buildingIds.length ? buildingIds.includes(r.buildingId) : true))
        .sort((a, b) => a.buildingCode.localeCompare(b.buildingCode) || a.name.localeCompare(b.name));

      return {
        kind: "rooms",
        date,
        columns: visible.map((r) => ({
          roomId: r.id,
          label: r.name,
          sub: `cap. ${r.capacity} · ${r.roomType}`,
        })),
      };
    }

    const monday = mondayOf(parseISO(date));
    return {
      kind: "days",
      columns: Array.from({ length: 7 }, (_, i) => {
        const d = addDays(monday, i);
        return {
          date: iso(d),
          label: format(d, "EEE"),
          sub: format(d, "d MMM"),
          isWeekend: i >= 5,
        };
      }),
    };
  }, [view, date, rooms.data, roomIds, buildingIds]);

  // ------------------------------------------------------------------ ghost blocks
  const ghosts: GhostBlock[] = useMemo(() => {
    const b = ghost.data?.booking;
    if (!b) return [];
    return b.occurrences
      .filter((o) => !o.isCancelled && o.date >= from && o.date <= to)
      .map((o) => ({
        date: o.date,
        roomId: o.roomId,
        startTime: o.startTime,
        endTime: o.endTime,
        label: b.courseCode ?? b.title,
      }));
  }, [ghost.data, from, to]);

  const clearGhost = () => {
    setParams(
      (p) => {
        p.delete("ghost");
        p.delete("from");
        return p;
      },
      { replace: true },
    );
  };

  // --------------------------------------------------------------------- actions
  const onEmptySlot = ({
    date: d,
    roomId,
    start,
    end,
  }: {
    date: string;
    roomId?: string;
    start: string;
    end: string;
  }) => {
    const q = new URLSearchParams({ date: d, start, end });
    if (roomId) q.set("roomId", roomId);
    navigate(`/requests/new?${q.toString()}`);
  };

  const ghostBooking = ghost.data?.booking;

  const approveGhost = () => {
    if (!ghostBooking) return;
    approve.mutate(ghostBooking.id, {
      onSuccess: () => {
        toast("Approved — instructor notified");
        clearGhost();
        if (fromQueue) navigate("/admin/dashboard");
      },
      onError: (e) => {
        const msg =
          e instanceof ApiError && e.code === "CONFLICT"
            ? "Cannot approve — the slot clashes with an approved booking."
            : "Could not approve the request.";
        toast(msg);
      },
    });
  };

  const activeFilters = [
    ...buildingIds.map((id) => ({
      key: "bldg",
      value: id,
      label: `Building: ${buildings.data?.items.find((b) => b.id === id)?.code ?? id}`,
    })),
    ...roomIds.map((id) => ({
      key: "room",
      value: id,
      label: `Room: ${rooms.data?.items.find((r) => r.id === id)?.name ?? id}`,
    })),
    ...instructorIds.map((id) => ({
      key: "inst",
      value: id,
      label: `Instructor: ${instructors.data?.items.find((u) => u.id === id)?.name ?? id}`,
    })),
    ...statuses.map((s) => ({
      key: "status",
      value: s,
      label: `Status: ${s[0]!.toUpperCase()}${s.slice(1)}`,
    })),
  ];

  const rangeLabel =
    view === "weekly"
      ? `${format(parseISO(from), "d")} – ${format(parseISO(to), "d MMM yyyy")}`
      : dateLabel(date);

  return (
    <main className="flex flex-col gap-4 p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Master Calendar</h1>
        <p className="text-sm text-neutral-500">
          {user
            ? "Room availability across the department. Click a booking to manage it."
            : "Room availability across the department. Log in to book a room."}
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-100 p-1">
            {(["weekly", "daily"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setParam("view", v)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                  view === v ? "bg-neutral-900 text-neutral-50" : "text-neutral-500",
                )}
              >
                {v}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => shiftDate(view === "weekly" ? -7 : -1)}
              aria-label="Previous"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setParam("date", iso(new Date()), true)}>
              Today
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => shiftDate(view === "weekly" ? 7 : 1)}
              aria-label="Next"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <div className="relative">
            <Button variant="outline" size="sm" className="gap-2" asChild>
              <label className="cursor-pointer">
                <CalendarDays className="size-4 text-neutral-500" />
                {rangeLabel}
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setParam("date", e.target.value, true)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </label>
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <FilterDropdown
            label="Building"
            icon={Building2}
            selected={buildingIds}
            onToggle={(v) => toggleMulti("bldg", buildingIds, v)}
            options={(buildings.data?.items ?? []).map((b) => ({ value: b.id, label: b.code }))}
          />
          <FilterDropdown
            label="Room"
            icon={DoorOpen}
            selected={roomIds}
            onToggle={(v) => toggleMulti("room", roomIds, v)}
            options={roomOptions}
          />
          {/* Instructor and Status filters are staff-only — the public view is approved-only. */}
          {user && (
          <FilterDropdown
            label="Instructor"
            icon={UserIcon}
            searchable
            selected={instructorIds}
            onToggle={(v) => toggleMulti("inst", instructorIds, v)}
            options={(instructors.data?.items ?? []).map((u) => ({
              value: u.id,
              label: [u.titlePrefix, u.name].filter(Boolean).join(" "),
            }))}
          />
          )}
          {user && (
          <FilterDropdown
            label="Status"
            icon={CircleCheck}
            selected={statuses}
            onToggle={(v) => toggleMulti("status", statuses, v)}
            options={[
              { value: "approved", label: "Approved" },
              { value: "pending", label: "Pending" },
            ]}
          />
          )}
        </div>
      </div>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-neutral-500">Active filters:</span>
          {activeFilters.map((f) => (
            <Badge
              key={`${f.key}-${f.value}`}
              variant="secondary"
              className="gap-1 rounded-full px-2.5 py-1 text-xs font-normal"
            >
              {f.label}
              <X
                className="size-3 cursor-pointer"
                onClick={() =>
                  toggleMulti(
                    f.key,
                    f.key === "bldg"
                      ? buildingIds
                      : f.key === "room"
                        ? roomIds
                        : f.key === "inst"
                          ? instructorIds
                          : statuses,
                    f.value,
                  )
                }
              />
            </Badge>
          ))}
          <button
            onClick={() =>
              setParams(
                (p) => {
                  ["bldg", "room", "inst", "status"].forEach((k) => p.delete(k));
                  return p;
                },
                { replace: true },
              )
            }
            className="text-xs text-neutral-950 underline underline-offset-4"
          >
            Clear all
          </button>
        </div>
      )}

      {calendar.isError ? (
        <ErrorCard onRetry={() => void calendar.refetch()} />
      ) : (
        <Card className="relative overflow-hidden p-0">
          <CalendarGrid
            model={model}
            occurrences={occurrences}
            ghosts={ghosts}
            isLoading={calendar.isPending}
            onOccurrenceClick={user ? setSelected : () => {}}
            onEmptySlotClick={user ? onEmptySlot : () => {}}
          />

          {calendar.isSuccess && occurrences.length === 0 && (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 flex justify-center">
              <div className="pointer-events-auto rounded-lg border border-neutral-200 bg-white px-6 py-4 text-center shadow-md">
                <p className="text-sm text-neutral-500">No bookings match your filters</p>
                <button
                  onClick={() =>
                    setParams(
                      (p) => {
                        ["bldg", "room", "inst", "status"].forEach((k) => p.delete(k));
                        return p;
                      },
                      { replace: true },
                    )
                  }
                  className="mt-1 text-xs text-neutral-950 underline underline-offset-4"
                >
                  Clear all filters
                </button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Legend */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="size-3 rounded bg-neutral-900" />
          <span className="text-xs text-neutral-500">Approved</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="stripes-pending-sm size-3 rounded border border-dashed border-neutral-200" />
          <span className="text-xs text-neutral-500">Pending</span>
        </div>
        {calendar.dataUpdatedAt > 0 && (
          <span className="ml-auto text-xs text-neutral-500">
            Updated {format(calendar.dataUpdatedAt, "HH:mm")}
          </span>
        )}
      </div>

      {/* Ghost action bar — the request being previewed from the pending queue. */}
      {ghostBooking && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-4 border-t border-neutral-200 bg-white px-8 py-4 shadow-2xl">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold">
              {ghostBooking.requestNo} · {ghostBooking.courseCode ?? ghostBooking.title} ·{" "}
              {ghostBooking.roomName}
            </span>
            <span className="text-xs text-neutral-500">
              {ghostBooking.instructorName} · {ghostBooking.startTime}–{ghostBooking.endTime} ·{" "}
              {ghostBooking.studentCount} students
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && ghostBooking.status === "pending" && (
              <>
                <Button onClick={approveGhost} disabled={approve.isPending}>
                  Approve
                </Button>
                <Button variant="outline" onClick={() => setRejectOpen(true)}>
                  Reject
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                clearGhost();
                if (fromQueue) navigate("/admin/dashboard");
              }}
            >
              {fromQueue ? "Back to queue" : "Dismiss"}
            </Button>
          </div>
        </div>
      )}

      {ghostBooking && (
        <RejectDialog
          open={rejectOpen}
          onOpenChange={setRejectOpen}
          isPending={reject.isPending}
          summary={`${ghostBooking.courseCode ?? ghostBooking.title} · ${ghostBooking.roomName}`}
          onConfirm={(reason) =>
            reject.mutate(
              { id: ghostBooking.id, reason },
              {
                onSuccess: () => {
                  toast("Rejected — instructor notified");
                  setRejectOpen(false);
                  clearGhost();
                  if (fromQueue) navigate("/admin/dashboard");
                },
              },
            )
          }
        />
      )}

      {/* Booking detail popover */}
      <BookingDetailDialog
        occurrence={selected}
        onClose={() => setSelected(null)}
        isAdmin={isAdmin}
        onMove={() => {
          setMoveConflict(null);
          setMoveOpen(true);
        }}
        onCancel={(id) =>
          cancel.mutate(
            { id, reason: "Cancelled by admin from the calendar" },
            {
              onSuccess: () => {
                toast("Booking cancelled");
                setSelected(null);
              },
            },
          )
        }
        onApprove={(id) =>
          approve.mutate(id, {
            onSuccess: () => {
              toast("Approved — instructor notified");
              setSelected(null);
            },
            onError: (e) =>
              toast(
                e instanceof ApiError && e.code === "CONFLICT"
                  ? "Cannot approve — clashes with an approved booking."
                  : "Could not approve.",
              ),
          })
        }
      />

      {selected && moveOpen && <MoveDialogLoader
        occurrence={selected}
        open={moveOpen}
        onOpenChange={setMoveOpen}
        conflictMessage={moveConflict}
        isPending={move.isPending}
        onConfirm={(body) => {
          move.mutate(
            { id: selected.bookingId, body },
            {
              onSuccess: () => {
                toast("Moved — instructor notified");
                setMoveOpen(false);
                setSelected(null);
              },
              onError: (e) => {
                if (e instanceof ApiError && e.code === "CONFLICT") {
                  const d = (e.details as ConflictDetail[])?.[0];
                  setMoveConflict(
                    d
                      ? `Clashes with ${d.existing.courseCode ?? d.existing.title}, ${d.roomName}, ${d.existing.startTime}–${d.existing.endTime}`
                      : "That slot is already taken.",
                  );
                  return;
                }
                toast("Could not move the booking.");
              },
            },
          );
        }}
      />}
    </main>
  );
}

/** Loads the full booking (occurrences + room list) the Move dialog needs. */
function MoveDialogLoader({
  occurrence,
  open,
  onOpenChange,
  conflictMessage,
  isPending,
  onConfirm,
}: {
  occurrence: CalendarOccurrence;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conflictMessage: string | null;
  isPending: boolean;
  onConfirm: (body: Record<string, unknown>) => void;
}) {
  const booking = useBooking(occurrence.bookingId);
  const rooms = useRooms({ active: "true" });

  if (!booking.data?.booking || !rooms.data) return null;

  return (
    <MoveDialog
      booking={booking.data.booking}
      occurrenceId={occurrence.occurrenceId}
      date={occurrence.date}
      rooms={rooms.data.items}
      open={open}
      onOpenChange={onOpenChange}
      isPending={isPending}
      conflictMessage={conflictMessage}
      onConfirm={onConfirm}
    />
  );
}

function BookingDetailDialog({
  occurrence,
  onClose,
  isAdmin,
  onMove,
  onCancel,
  onApprove,
}: {
  occurrence: CalendarOccurrence | null;
  onClose: () => void;
  isAdmin: boolean;
  onMove: () => void;
  onCancel: (id: string) => void;
  onApprove: (id: string) => void;
}) {
  const detail = useBooking(occurrence?.bookingId ?? null);
  const b = detail.data?.booking;

  return (
    <Dialog open={!!occurrence} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {!b ? (
          <EmptyState title="Loading booking…" />
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle>{b.courseCode ?? b.title}</DialogTitle>
                <StatusBadge status={b.status} />
              </div>
              <DialogDescription>
                {b.requestNo} · {b.title}
                {b.section ? ` · Sec ${b.section}` : ""}
              </DialogDescription>
            </DialogHeader>

            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-neutral-500">Room</dt>
                <dd>
                  {b.roomName} {b.roomCapacity ? `(cap. ${b.roomCapacity})` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Instructor</dt>
                <dd>{b.instructorName}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Time</dt>
                <dd>
                  {b.startTime}–{b.endTime}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Students</dt>
                <dd>{b.studentCount}</dd>
              </div>
              {b.note && (
                <div className="col-span-2">
                  <dt className="text-xs text-neutral-500">Note</dt>
                  <dd>{b.note}</dd>
                </div>
              )}
              {b.rejectReason && (
                <div className="col-span-2">
                  <dt className="text-xs text-neutral-500">Rejection reason</dt>
                  <dd>{b.rejectReason}</dd>
                </div>
              )}
            </dl>

            {isAdmin && (
              <DialogFooter>
                {b.status === "pending" && <Button onClick={() => onApprove(b.id)}>Approve</Button>}
                {b.status === "approved" && (
                  <>
                    <Button variant="outline" onClick={() => onCancel(b.id)}>
                      Cancel booking
                    </Button>
                    <Button onClick={onMove}>Move</Button>
                  </>
                )}
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
