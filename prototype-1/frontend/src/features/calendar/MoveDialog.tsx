import { useState } from "react";
import type { BookingDetail, Room } from "@/api/types";
import { Spinner } from "@/components/states";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { TIME_SLOTS } from "@/lib/formatters";

/**
 * The keyboard/menu "Move" flow (§7c) — the shipped alternative to drag-and-drop.
 * Recurring bookings force an explicit occurrence-vs-series choice.
 */
export function MoveDialog({
  booking,
  occurrenceId,
  date,
  rooms,
  open,
  onOpenChange,
  isPending,
  conflictMessage,
  onConfirm,
}: {
  booking: BookingDetail;
  occurrenceId: string | null;
  date: string;
  rooms: Room[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  conflictMessage: string | null;
  onConfirm: (body: Record<string, unknown>) => void;
}) {
  const [roomId, setRoomId] = useState(booking.roomId);
  const [newDate, setNewDate] = useState(date);
  const [startTime, setStartTime] = useState(booking.startTime);
  const [endTime, setEndTime] = useState(booking.endTime);
  const [scope, setScope] = useState<"occurrence" | "series">("occurrence");

  const isRecurring = booking.bookingType === "recurring";

  const submit = () => {
    const body: Record<string, unknown> = { roomId, startTime, endTime };
    if (isRecurring) {
      body.scope = scope;
      if (scope === "occurrence") {
        body.occurrenceId = occurrenceId;
        body.date = newDate;
      }
    } else {
      body.scope = "series";
      body.date = newDate;
    }
    onConfirm(body);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move booking</DialogTitle>
          <DialogDescription>
            {booking.courseCode ?? booking.title} · currently {booking.roomName}{" "}
            {booking.startTime}–{booking.endTime}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Room</Label>
            <Select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} (cap. {r.capacity})
                </option>
              ))}
            </Select>
          </div>

          {(!isRecurring || scope === "occurrence") && (
            <div className="flex flex-col gap-2">
              <Label>Date</Label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="h-9 rounded-md border border-neutral-200 px-3 text-sm shadow-sm"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Start time</Label>
              <Select value={startTime} onChange={(e) => setStartTime(e.target.value)}>
                {TIME_SLOTS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>End time</Label>
              <Select value={endTime} onChange={(e) => setEndTime(e.target.value)}>
                {TIME_SLOTS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {isRecurring && (
            <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-neutral-100/30 p-3">
              <Label>Apply to</Label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={scope === "occurrence"}
                  onChange={() => setScope("occurrence")}
                />
                This occurrence only
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={scope === "series"}
                  onChange={() => setScope("series")}
                />
                All future occurrences
              </label>
            </div>
          )}

          {conflictMessage && (
            <div className="rounded-lg border-2 border-neutral-950 bg-neutral-100 p-3 text-xs font-medium">
              {conflictMessage}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending || endTime <= startTime}>
            {isPending && <Spinner />}
            Move booking
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
