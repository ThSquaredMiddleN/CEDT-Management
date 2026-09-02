import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  CircleCheck,
  DoorOpen,
  Info,
  Lock,
  Repeat,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "@/api/client";
import { useBooking, useCreateBooking, useRooms, useTerms, useUsers } from "@/api/endpoints";
import type { Booking, BookingInput, Course } from "@/api/types";
import { useAuth } from "@/app/AuthProvider";
import { Spinner } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DAY_FULL, TIME_SLOTS } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { CourseTypeahead } from "./CourseTypeahead";
import { useConflictCheck, type ConflictInput } from "./useConflictCheck";

interface FormValues {
  termId: string;
  bookingType: "recurring" | "one_off";
  courseId: string;
  instructorId: string;
  dayOfWeek: string;
  startDate: string;
  endDate: string;
  oneOffDate: string;
  startTime: string;
  endTime: string;
  roomId: string;
  section: string;
  studentCount: number;
  note: string;
}

export function BookingForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  // Single `staff` role: every booking a staff user submits is auto-approved.
  const isAdmin = true;
  const cloneId = params.get("clone");

  const terms = useTerms();
  const rooms = useRooms({ active: "true" });
  const instructors = useUsers({ role: "staff", active: "true" });
  const clone = useBooking(cloneId);

  const create = useCreateBooking();

  const [course, setCourse] = useState<Course | null>(null);
  const [created, setCreated] = useState<Booking | null>(null);

  const form = useForm<FormValues>({
    defaultValues: {
      termId: "",
      bookingType: "recurring",
      courseId: "",
      instructorId: user?.id ?? "",
      dayOfWeek: "1",
      startDate: "",
      endDate: "",
      oneOffDate: params.get("date") ?? "",
      startTime: params.get("start") ?? "",
      endTime: params.get("end") ?? "",
      roomId: params.get("roomId") ?? "",
      section: "",
      studentCount: 1,
      note: "",
    },
  });

  const v = form.watch();
  const activeTerm = terms.data?.items.find((t) => t.isActive);
  const selectedRoom = rooms.data?.items.find((r) => r.id === v.roomId);

  // Default the term and date range to the active term once master data lands.
  useEffect(() => {
    if (!activeTerm || form.getValues("termId")) return;
    form.setValue("termId", activeTerm.id);
    form.setValue("startDate", activeTerm.startDate);
    form.setValue("endDate", activeTerm.endDate);

    // A slot click carries a concrete date; make it the recurring day-of-week too.
    const prefillDate = params.get("date");
    if (prefillDate) {
      form.setValue("dayOfWeek", String(new Date(`${prefillDate}T00:00:00Z`).getUTCDay()));
    }
  }, [activeTerm, form, params]);

  // Rebook: copy the source request, dropping its (now past) status and dates if needed.
  useEffect(() => {
    const src = clone.data?.booking;
    if (!src) return;
    form.reset({
      termId: src.termId,
      bookingType: src.bookingType,
      courseId: src.courseId ?? "",
      instructorId: src.instructorId,
      dayOfWeek: String(src.dayOfWeek ?? 1),
      startDate: src.startDate ?? activeTerm?.startDate ?? "",
      endDate: src.endDate ?? activeTerm?.endDate ?? "",
      oneOffDate: src.oneOffDate ?? "",
      startTime: src.startTime,
      endTime: src.endTime,
      roomId: src.roomId,
      section: src.section ?? "",
      studentCount: src.studentCount,
      note: src.note ?? "",
    });
    if (src.courseId && src.courseCode) {
      setCourse({
        id: src.courseId,
        code: src.courseCode,
        name: src.title,
        isActive: true,
        defaultInstructor: null,
      });
    }
  }, [clone.data, form, activeTerm]);

  const conflictInput: ConflictInput = {
    termId: v.termId,
    bookingType: v.bookingType,
    dayOfWeek: v.dayOfWeek,
    startDate: v.startDate,
    endDate: v.endDate,
    oneOffDate: v.oneOffDate,
    startTime: v.startTime,
    endTime: v.endTime,
    roomId: v.roomId,
    studentCount: Number(v.studentCount) || 1,
    courseId: v.courseId || null,
    instructorId: v.instructorId,
  };

  const { state, result, setBlockedFromSubmit } = useConflictCheck(conflictInput);

  // Capacity is recomputed locally so the notice tracks the field live (BR-9, non-blocking).
  const capacityWarning =
    selectedRoom && Number(v.studentCount) > selectedRoom.capacity
      ? { roomCapacity: selectedRoom.capacity, studentCount: Number(v.studentCount) }
      : null;

  const fieldsComplete =
    !!v.termId &&
    !!v.courseId &&
    !!v.instructorId &&
    !!v.roomId &&
    !!v.startTime &&
    !!v.endTime &&
    v.endTime > v.startTime &&
    Number(v.studentCount) >= 1 &&
    (v.bookingType === "recurring"
      ? !!v.startDate && !!v.endDate && v.endDate >= v.startDate && v.dayOfWeek !== ""
      : !!v.oneOffDate);

  // The single rule that gates Submit. Capacity + pending overlaps never block it.
  const canSubmit = fieldsComplete && state === "clear";

  const onSubmit = (values: FormValues) => {
    const payload: BookingInput = {
      bookingType: values.bookingType,
      termId: values.termId,
      courseId: values.courseId || null,
      title: values.courseId ? null : "Booking",
      section: values.section || null,
      instructorId: values.instructorId,
      roomId: values.roomId,
      dayOfWeek: values.bookingType === "recurring" ? Number(values.dayOfWeek) : null,
      startDate: values.bookingType === "recurring" ? values.startDate : null,
      endDate: values.bookingType === "recurring" ? values.endDate : null,
      oneOffDate: values.bookingType === "one_off" ? values.oneOffDate : null,
      startTime: values.startTime,
      endTime: values.endTime,
      studentCount: Number(values.studentCount),
      note: values.note || null,
    };

    create.mutate(payload, {
      onSuccess: (data) => setCreated((data as { booking: Booking }).booking),
      onError: (e) => {
        // Never clear the form on a 409 — keep every value and just show the banner.
        if (e instanceof ApiError && e.code === "CONFLICT") {
          setBlockedFromSubmit(
            (e.details as { date: string; roomName: string; existing: never }[]) ?? [],
          );
        }
      },
    });
  };

  // ------------------------------------------------------------------ success screen
  if (created) {
    return (
      <main className="mx-auto max-w-[1140px] p-8">
        <Card className="mx-auto flex max-w-[760px] flex-col items-center gap-6 p-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-neutral-900 text-neutral-50">
            <CheckCircle2 className="size-6" />
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {isAdmin ? "Booking created and approved" : "Request submitted"}
            </h1>
            <p className="text-sm text-neutral-500">
              {created.requestNo} · {created.courseCode ?? created.title} · {created.roomName} ·{" "}
              {created.startTime}–{created.endTime}
            </p>
            <p className="text-sm text-neutral-500">
              {isAdmin ? "The slot is now blocked on the calendar." : "Pending admin approval."}
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => navigate(isAdmin ? "/calendar" : "/requests")}>
              {isAdmin ? "Back to calendar" : "Go to My Requests"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setCreated(null);
                setCourse(null);
                form.reset();
              }}
            >
              Submit another
            </Button>
          </div>
        </Card>
      </main>
    );
  }

  const conflicts = result?.conflicts ?? [];
  const alternatives = result?.alternativeRooms ?? [];
  const pendingOverlaps = result?.pendingOverlaps ?? [];

  return (
    <main className="mx-auto max-w-[1140px] p-8">
      <div className="mx-auto flex max-w-[760px] flex-col gap-4">
        <button
          onClick={() => navigate(-1)}
          className="flex w-fit items-center gap-1 text-sm text-neutral-500 hover:text-neutral-950"
        >
          <ChevronLeft className="size-4" />
          Back to Calendar
        </button>

        <Card className="flex flex-col gap-6 p-8">
          <CardHeader>
            <CardTitle className="text-2xl">New Booking Request</CardTitle>
            <CardDescription>
              Submit a room booking request. Conflicts are checked in real time before you submit.
            </CardDescription>
          </CardHeader>

          {cloneId && clone.data && (
            <div className="rounded-lg border border-neutral-200 bg-neutral-100 p-3 text-xs text-neutral-500">
              Cloned from {clone.data.booking.requestNo}
            </div>
          )}

          <form className="flex flex-col gap-6" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>Term</Label>
                <Select {...form.register("termId")}>
                  {(terms.data?.items ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.isActive ? "(Active)" : ""}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label>Booking Type</Label>
                <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-100 p-1">
                  {(
                    [
                      { value: "recurring", label: "Weekly Recurring", icon: Repeat },
                      { value: "one_off", label: "One-off", icon: CalendarDays },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => form.setValue("bookingType", opt.value)}
                      className={cn(
                        "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                        v.bookingType === opt.value
                          ? "bg-neutral-900 text-neutral-50"
                          : "text-neutral-500",
                      )}
                    >
                      <opt.icon className="size-3.5" />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>Course Code</Label>
                <CourseTypeahead
                  value={course}
                  onSelect={(c) => {
                    setCourse(c);
                    form.setValue("courseId", c.id);
                    if (c.defaultInstructor) {
                      form.setValue("instructorId", c.defaultInstructor.id);
                    }
                  }}
                  onClear={() => {
                    setCourse(null);
                    form.setValue("courseId", "");
                  }}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label className="text-neutral-500">Course Name</Label>
                <Input
                  readOnly
                  value={course?.name ?? ""}
                  placeholder="Auto-filled from the course code"
                  className="bg-neutral-100 text-neutral-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>Instructor Name</Label>
                <Select {...form.register("instructorId")}>
                  {(instructors.data?.items ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {[u.titlePrefix, u.name].filter(Boolean).join(" ")}
                      {u.id === user?.id ? " (You)" : ""}
                    </option>
                  ))}
                </Select>
              </div>

              {v.bookingType === "recurring" ? (
                <div className="flex flex-col gap-2">
                  <Label>Day of Week</Label>
                  <Select {...form.register("dayOfWeek")}>
                    {DAY_FULL.map((d, i) => (
                      <option key={d} value={String(i)}>
                        {d}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <Label>Date</Label>
                  <Input type="date" {...form.register("oneOffDate")} />
                </div>
              )}
            </div>

            {v.bookingType === "recurring" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Start Date</Label>
                  <Input type="date" {...form.register("startDate")} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>End Date</Label>
                  <Input type="date" {...form.register("endDate")} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>Start Time</Label>
                <Select {...form.register("startTime")}>
                  <option value="">Select…</option>
                  {TIME_SLOTS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>End Time</Label>
                <Select {...form.register("endTime")}>
                  <option value="">Select…</option>
                  {TIME_SLOTS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>Room Preference</Label>
                <Select {...form.register("roomId")}>
                  <option value="">Select a room…</option>
                  {(rooms.data?.items ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} (cap. {r.capacity})
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Section</Label>
                <Input placeholder="e.g. Sec 2" {...form.register("section")} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>Student Count</Label>
                <Input
                  type="number"
                  min={1}
                  {...form.register("studentCount", { valueAsNumber: true })}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Note (optional)</Label>
              <Textarea
                className="min-h-20"
                placeholder="Add any note for the CEDT Admin..."
                {...form.register("note")}
              />
            </div>

            {/* Blocking conflict banner */}
            {state === "blocked" && (
              <div className="flex flex-col gap-3 rounded-lg border-2 border-neutral-950 bg-neutral-100 p-4">
                <div className="flex items-start gap-2">
                  <TriangleAlert className="mt-0.5 size-5 shrink-0" />
                  <div className="flex flex-col gap-1">
                    <span className="font-bold">Time conflict detected</span>
                    {conflicts.length === 0 && (
                      <span className="text-sm font-semibold">
                        That slot was just taken by another approved booking.
                      </span>
                    )}
                    {/* One line per distinct clashing booking, not per occurrence. */}
                    {[
                      ...new Map(
                        conflicts.map((c) => [
                          `${c.roomName}-${c.existing.courseCode}-${c.existing.startTime}`,
                          c,
                        ]),
                      ).values(),
                    ].map((c, i) => (
                      <span key={i} className="text-sm font-semibold">
                        Room {c.roomName} is booked {c.existing.startTime}–{c.existing.endTime} by{" "}
                        {c.existing.courseCode ?? c.existing.title}{" "}
                        {c.existing.dayOfWeek !== null
                          ? `on ${DAY_FULL[c.existing.dayOfWeek]}s.`
                          : `on ${c.date}.`}
                      </span>
                    ))}
                  </div>
                </div>

                {alternatives.length > 0 && (
                  <div className="flex flex-col gap-2 pl-8">
                    <span className="text-xs text-neutral-500">
                      Alternative free rooms (capacity ≥ {v.studentCount}):
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {alternatives.map((alt) => (
                        <button
                          key={alt.roomId}
                          type="button"
                          // Swapping the room re-triggers the watcher, which re-runs the check.
                          onClick={() => form.setValue("roomId", alt.roomId)}
                          className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-neutral-100"
                        >
                          <DoorOpen className="size-3.5" />
                          {alt.roomName} (cap. {alt.capacity})
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Non-blocking notices */}
            {capacityWarning && (
              <div className="flex items-start gap-2 rounded-lg border border-neutral-200 bg-neutral-100 p-4 text-sm text-neutral-500">
                <Info className="mt-0.5 size-4 shrink-0" />
                <span>
                  Student count ({capacityWarning.studentCount}) exceeds the selected room capacity (
                  {capacityWarning.roomCapacity}). This is a non-blocking notice — the Admin will
                  make the final call.
                </span>
              </div>
            )}

            {pendingOverlaps.length > 0 && state !== "blocked" && (
              <div className="flex items-start gap-2 rounded-lg border border-neutral-200 bg-neutral-100 p-4 text-sm text-neutral-500">
                <Info className="mt-0.5 size-4 shrink-0" />
                <span>Another pending request overlaps this slot.</span>
              </div>
            )}

            {/* Live check status */}
            <div className="flex items-center gap-2 text-sm">
              {(state === "debouncing" || state === "checking") && (
                <span className="flex items-center gap-2 text-neutral-500">
                  <Spinner /> Checking availability…
                </span>
              )}
              {state === "clear" && (
                <span className="flex items-center gap-2 text-neutral-950">
                  <CircleCheck className="size-4" /> Slot is free
                </span>
              )}
              {state === "error" && (
                <span className="text-neutral-500">Couldn't check availability — try again</span>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-neutral-200 pt-6">
              <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit || create.isPending}>
                {create.isPending ? (
                  <Spinner />
                ) : (
                  !canSubmit && <Lock className="size-4" />
                )}
                {isAdmin ? "Create & approve" : "Submit Request"}
              </Button>
            </div>
          </form>
        </Card>

        <p className="text-center text-xs text-neutral-500">
          Submit is disabled until all conflicts are resolved and required fields are complete.
        </p>
      </div>
    </main>
  );
}
