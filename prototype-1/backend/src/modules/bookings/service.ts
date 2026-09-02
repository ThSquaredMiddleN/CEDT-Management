import type { Booking, BookingStatus, Prisma } from "@prisma/client";
import { prisma, type Tx } from "../../db.js";
import {
  conflict,
  forbidden,
  invalidTransition,
  isExclusionViolation,
  notFound,
  validation,
} from "../../lib/errors.js";
import { nextRequestNo } from "../../lib/requestNo.js";
import {
  addDaysISO,
  dateFromISO,
  dayOrDate,
  hhmm,
  isInWindow,
  isoDate,
  timeFromHHMM,
  todayISO,
} from "../../lib/time.js";
import type { SessionUser } from "../../plugins/auth.js";
import { expandOccurrences, type Candidate } from "../conflicts/expand.js";
import { findAlternativeRooms, findConflicts, type ConflictEntry } from "../conflicts/find.js";
import { activeAdminIds, notify, type NotifyPayload } from "../notifications/service.js";
import type { BookingInput } from "./schemas.js";

interface Snapshot {
  courseCode: string | null;
  courseName: string | null;
  instructorName: string | null;
  roomName: string;
  buildingCode: string;
}

/** Master-data lookups shared by create and check-conflicts, with BR-4/BR-17 validation. */
async function loadRefs(input: BookingInput, tx: Tx) {
  const [term, room, instructor, course] = await Promise.all([
    tx.term.findUnique({ where: { id: input.termId } }),
    tx.room.findUnique({ where: { id: input.roomId }, include: { building: true } }),
    tx.user.findUnique({ where: { id: input.instructorId } }),
    input.courseId ? tx.course.findUnique({ where: { id: input.courseId } }) : Promise.resolve(null),
  ]);

  if (!term) throw notFound("Unknown term");
  if (!room) throw notFound("Unknown room");
  if (!instructor) throw notFound("Unknown instructor");
  if (input.courseId && !course) throw notFound("Unknown course");

  // BR-17: times must sit inside the 07:00-21:00 display window (the 30-min grid is in Zod).
  if (!isInWindow(input.startTime) || !isInWindow(input.endTime)) {
    throw validation("Times must fall within 07:00-21:00", [
      { field: "startTime", message: "must be between 07:00 and 21:00" },
    ]);
  }

  // BR-4: the whole booking must sit inside the term's date range.
  const termStart = isoDate(term.startDate);
  const termEnd = isoDate(term.endDate);
  const outside = (d: string) => d < termStart || d > termEnd;

  if (input.bookingType === "recurring") {
    if (outside(input.startDate!) || outside(input.endDate!)) {
      throw validation(`Dates must fall inside the term (${termStart} to ${termEnd})`, [
        { field: "startDate", message: `must be within ${termStart} - ${termEnd}` },
      ]);
    }
  } else if (outside(input.oneOffDate!)) {
    throw validation(`Date must fall inside the term (${termStart} to ${termEnd})`, [
      { field: "oneOffDate", message: `must be within ${termStart} - ${termEnd}` },
    ]);
  }

  return { term, room, instructor, course };
}

export interface CheckConflictsResult {
  hasBlockingConflicts: boolean;
  conflicts: ConflictEntry[];
  pendingOverlaps: { date: string; startTime: string; endTime: string }[];
  capacityWarning: { roomCapacity: number; studentCount: number } | null;
  alternativeRooms: { roomId: string; roomName: string; buildingCode: string; capacity: number }[];
}

/** BR-6 call site 1: read-only advisory check powering the live form banner. */
export async function checkConflicts(
  input: BookingInput & { excludeBookingId?: string | null },
  tx: Tx = prisma,
): Promise<CheckConflictsResult> {
  const { room } = await loadRefs(input, tx);
  const candidates = expandOccurrences(input);
  const { blocking, pending } = await findConflicts(
    candidates,
    input.excludeBookingId ?? null,
    tx,
  );

  const alternativeRooms =
    blocking.length > 0
      ? await findAlternativeRooms(candidates, input.roomId, input.studentCount, tx)
      : [];

  return {
    hasBlockingConflicts: blocking.length > 0,
    conflicts: blocking,
    pendingOverlaps: pending,
    // BR-9: never blocks, purely advisory.
    capacityWarning:
      input.studentCount > room.capacity
        ? { roomCapacity: room.capacity, studentCount: input.studentCount }
        : null,
    alternativeRooms,
  };
}

function notifyPayload(b: Booking, snap: Snapshot, reason?: string | null): NotifyPayload {
  return {
    bookingId: b.id,
    requestNo: b.requestNo,
    courseCode: snap.courseCode,
    roomName: snap.roomName,
    date: b.oneOffDate ? isoDate(b.oneOffDate) : null,
    dayOfWeek: b.dayOfWeek,
    startTime: hhmm(b.startTime),
    endTime: hhmm(b.endTime),
    reason: reason ?? null,
  };
}

/**
 * BR-5 + BR-12: create a booking and materialize its occurrences in ONE transaction.
 * Single `staff` role, so bookings auto-approve by default (approved + blocking rows, guarded
 * by the exclusion constraint). The seed passes `autoApprove: false` to craft pending demo rows.
 */
export async function createBooking(
  input: BookingInput,
  actor: SessionUser,
  opts: { autoApprove?: boolean } = {},
) {
  const autoApprove = opts.autoApprove ?? true;

  try {
    return await prisma.$transaction(async (tx) => {
      const { room, instructor, course } = await loadRefs(input, tx);
      const candidates = expandOccurrences(input);

      // BR-6 call site 2: re-check at submit — a conflict may have appeared since form load.
      const { blocking } = await findConflicts(candidates, null, tx);
      if (blocking.length > 0) {
        throw conflict(
          `Cannot book: ${blocking.length} occurrence(s) clash with approved bookings.`,
          blocking,
        );
      }

      const snapshot: Snapshot = {
        courseCode: course?.code ?? null,
        courseName: course?.name ?? null,
        instructorName: [instructor.titlePrefix, instructor.name].filter(Boolean).join(" "),
        roomName: room.name,
        buildingCode: room.building.code,
      };

      // BR-20: course-backed bookings derive their title from the course; ignore client title.
      const title = course ? course.name : input.title!;
      const requestNo = await nextRequestNo(tx);

      const booking = await tx.booking.create({
        data: {
          requestNo,
          status: autoApprove ? "approved" : "pending",
          bookingType: input.bookingType,
          termId: input.termId,
          courseId: input.courseId ?? null,
          title,
          section: input.section ?? null,
          instructorId: input.instructorId,
          requestedBy: actor.id,
          roomId: input.roomId,
          dayOfWeek: input.bookingType === "recurring" ? input.dayOfWeek! : null,
          startDate:
            input.bookingType === "recurring" ? dateFromISO(input.startDate!) : null,
          endDate: input.bookingType === "recurring" ? dateFromISO(input.endDate!) : null,
          oneOffDate:
            input.bookingType === "one_off" ? dateFromISO(input.oneOffDate!) : null,
          startTime: timeFromHHMM(input.startTime),
          endTime: timeFromHHMM(input.endTime),
          studentCount: input.studentCount,
          note: input.note ?? null,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          decidedById: autoApprove ? actor.id : null,
          decidedAt: autoApprove ? new Date() : null,
        },
      });

      await tx.bookingOccurrence.createMany({
        data: candidates.map((c) => ({
          bookingId: booking.id,
          roomId: c.roomId,
          date: dateFromISO(c.date),
          startTime: timeFromHHMM(c.startTime),
          endTime: timeFromHHMM(c.endTime),
          isCancelled: false,
          isBlocking: autoApprove, // <- exclusion constraint fires here on an admin race
        })),
      });

      await tx.bookingEvent.create({
        data: {
          bookingId: booking.id,
          actorId: actor.id,
          eventType: autoApprove ? "approved" : "created",
          newValue: { status: booking.status } as Prisma.InputJsonValue,
        },
      });

      // BR-15: instructors' submissions notify every active admin.
      if (!autoApprove) {
        const when = dayOrDate(booking.dayOfWeek, booking.oneOffDate ? isoDate(booking.oneOffDate) : null);
        await notify(tx, {
          userIds: await activeAdminIds(tx),
          type: "request_submitted",
          message: `New request from ${snapshot.instructorName}: ${
            snapshot.courseCode ?? booking.title
          }, ${snapshot.roomName}, ${when} ${hhmm(booking.startTime)}-${hhmm(booking.endTime)}`,
          bookingId: booking.id,
          payload: notifyPayload(booking, snapshot),
        });
      }

      return await getBookingDetail(booking.id, actor, tx);
    });
  } catch (e) {
    // BR-7: the DB is the guarantee — a race that beat the app check lands here.
    if (isExclusionViolation(e)) {
      throw conflict("That slot was just taken by another approved booking.", []);
    }
    throw e;
  }
}

/** BR-6 call site 3 (§7.3): the critical approve race. */
export async function approveBooking(id: string, actor: SessionUser) {
  try {
    return await prisma.$transaction(async (tx) => {
      // Serialize concurrent actions on this booking.
      const locked = await tx.$queryRaw<{ id: string; status: BookingStatus }[]>`
        SELECT id, status FROM bookings WHERE id = ${id}::uuid FOR UPDATE
      `;
      const row = locked[0];
      if (!row) throw notFound("Booking not found");
      if (row.status !== "pending") {
        throw invalidTransition("This request was already actioned.");
      }

      const occs = await tx.bookingOccurrence.findMany({
        where: { bookingId: id, isCancelled: false },
      });
      const candidates: Candidate[] = occs.map((o) => ({
        roomId: o.roomId,
        date: isoDate(o.date),
        startTime: hhmm(o.startTime),
        endTime: hhmm(o.endTime),
      }));

      // Friendly pre-check; the constraint below is the real guarantee (BR-8).
      const { blocking } = await findConflicts(candidates, id, tx);
      if (blocking.length > 0) {
        throw conflict(
          `Cannot approve: ${blocking.length} occurrence(s) clash with approved bookings.`,
          blocking,
        );
      }

      await tx.booking.update({
        where: { id },
        data: { status: "approved", decidedById: actor.id, decidedAt: new Date() },
      });

      // Exclusion constraint fires HERE if a race slipped past the pre-check.
      await tx.$executeRaw`
        UPDATE booking_occurrences SET is_blocking = NOT is_cancelled WHERE booking_id = ${id}::uuid
      `;

      const booking = await tx.booking.findUniqueOrThrow({ where: { id } });
      const snap = booking.snapshot as unknown as Snapshot;

      await tx.bookingEvent.create({
        data: { bookingId: id, actorId: actor.id, eventType: "approved" },
      });

      const when = dayOrDate(
        booking.dayOfWeek,
        booking.oneOffDate ? isoDate(booking.oneOffDate) : null,
      );
      await notify(tx, {
        userIds: [booking.instructorId, booking.requestedBy],
        type: "request_approved",
        message: `Approved: ${snap.courseCode ?? booking.title}, ${snap.roomName}, ${when} ${hhmm(
          booking.startTime,
        )}-${hhmm(booking.endTime)}`,
        bookingId: id,
        payload: notifyPayload(booking, snap),
      });

      return await getBookingDetail(id, actor, tx);
    });
  } catch (e) {
    if (isExclusionViolation(e)) {
      // Booking stays pending; re-run the check outside the tx to fill in the details.
      const occs = await prisma.bookingOccurrence.findMany({
        where: { bookingId: id, isCancelled: false },
      });
      const { blocking } = await findConflicts(
        occs.map((o) => ({
          roomId: o.roomId,
          date: isoDate(o.date),
          startTime: hhmm(o.startTime),
          endTime: hhmm(o.endTime),
        })),
        id,
      );
      throw conflict("Cannot approve: the slot was taken by an earlier approval.", blocking);
    }
    throw e;
  }
}

/** BR-11: rejection always carries a written reason (>= 10 chars, also a DB CHECK). */
export async function rejectBooking(id: string, reason: string, actor: SessionUser) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id } });
    if (!booking) throw notFound("Booking not found");
    if (booking.status !== "pending") throw invalidTransition("This request was already actioned.");

    await tx.booking.update({
      where: { id },
      data: {
        status: "rejected",
        rejectReason: reason,
        decidedById: actor.id,
        decidedAt: new Date(),
      },
    });
    await tx.bookingOccurrence.updateMany({
      where: { bookingId: id },
      data: { isBlocking: false },
    });
    await tx.bookingEvent.create({
      data: { bookingId: id, actorId: actor.id, eventType: "rejected", reason },
    });

    const snap = booking.snapshot as unknown as Snapshot;
    await notify(tx, {
      userIds: [booking.instructorId, booking.requestedBy],
      type: "request_rejected",
      message: `Rejected: ${snap.courseCode ?? booking.title} — ${reason}`,
      bookingId: id,
      payload: notifyPayload(booking, snap, reason),
    });

    return await getBookingDetail(id, actor, tx);
  });
}

/** BR-13: withdraw (pending) / cancel (approved, future) / admin single-occurrence cancel. */
export async function cancelBooking(
  id: string,
  body: { reason?: string | null; occurrenceId?: string | null },
  actor: SessionUser,
) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id },
      include: { occurrences: true },
    });
    if (!booking) throw notFound("Booking not found");

    // Single `staff` role: every authenticated user has full (formerly admin) privileges.
    const isAdmin = true;
    const isOwner = booking.requestedBy === actor.id;

    if (booking.status === "rejected" || booking.status === "cancelled") {
      throw invalidTransition("This request was already actioned.");
    }

    const snap = booking.snapshot as unknown as Snapshot;
    const today = todayISO();

    // Admin single-occurrence cancel: the parent booking stays approved.
    if (body.occurrenceId) {
      if (!isAdmin) throw forbidden("Only an admin can cancel a single occurrence");
      const occ = booking.occurrences.find((o) => o.id === body.occurrenceId);
      if (!occ) throw notFound("Occurrence not found");

      await tx.bookingOccurrence.update({
        where: { id: occ.id },
        data: { isCancelled: true, isBlocking: false },
      });
      await tx.bookingEvent.create({
        data: {
          bookingId: id,
          actorId: actor.id,
          eventType: "occurrence_cancelled",
          reason: body.reason ?? null,
        },
      });
      await notify(tx, {
        userIds: [booking.instructorId],
        type: "booking_moved",
        message: `An occurrence of your ${snap.courseCode ?? booking.title} booking on ${isoDate(
          occ.date,
        )} was cancelled`,
        bookingId: id,
        payload: notifyPayload(booking, snap, body.reason),
      });
      return await getBookingDetail(id, actor, tx);
    }

    const wasPending = booking.status === "pending";

    if (isOwner && !isAdmin) {
      if (!wasPending) {
        // Owner cancelling an APPROVED booking: must be future, and a reason is required.
        const hasFuture = booking.occurrences.some(
          (o) => !o.isCancelled && isoDate(o.date) >= today,
        );
        if (!hasFuture) throw forbidden("Past bookings cannot be cancelled");
        if (!body.reason || body.reason.trim().length === 0) {
          throw validation("A reason is required to cancel an approved booking", [
            { field: "reason", message: "required" },
          ]);
        }
      }
    }

    await tx.booking.update({
      where: { id },
      data: { status: "cancelled", cancelReason: body.reason ?? null },
    });
    // Cancellation only ever clears blocking rows — it can never violate the constraint.
    await tx.bookingOccurrence.updateMany({
      where: { bookingId: id },
      data: { isBlocking: false },
    });
    await tx.bookingEvent.create({
      data: {
        bookingId: id,
        actorId: actor.id,
        eventType: wasPending ? "withdrawn" : "cancelled",
        reason: body.reason ?? null,
      },
    });

    const when = dayOrDate(
      booking.dayOfWeek,
      booking.oneOffDate ? isoDate(booking.oneOffDate) : null,
    );

    if (isOwner && !isAdmin) {
      if (wasPending) {
        // BR-13: only notify admins about withdrawals of requests older than 24h (noise reduction).
        const ageHours = (Date.now() - booking.createdAt.getTime()) / 3_600_000;
        if (ageHours > 24) {
          await notify(tx, {
            userIds: await activeAdminIds(tx),
            type: "request_withdrawn",
            message: `${snap.instructorName} withdrew request ${booking.requestNo}`,
            bookingId: id,
            payload: notifyPayload(booking, snap, body.reason),
          });
        }
      } else {
        await notify(tx, {
          userIds: await activeAdminIds(tx),
          type: "booking_cancelled_by_instructor",
          message: `${snap.instructorName} cancelled ${snap.courseCode ?? booking.title}, ${
            snap.roomName
          }, ${when} — ${body.reason ?? ""}`,
          bookingId: id,
          payload: notifyPayload(booking, snap, body.reason),
        });
      }
    } else if (isAdmin && booking.requestedBy !== actor.id) {
      await notify(tx, {
        userIds: [booking.instructorId, booking.requestedBy],
        type: "booking_cancelled_by_instructor",
        message: `Your booking ${snap.courseCode ?? booking.title} (${
          snap.roomName
        }, ${when}) was cancelled by the admin`,
        bookingId: id,
        payload: notifyPayload(booking, snap, body.reason),
      });
    }

    return await getBookingDetail(id, actor, tx);
  });
}

/** BR-6 call site 4: admin move/edit, occurrence- or series-scoped. */
export async function patchBooking(
  id: string,
  body: {
    scope?: "occurrence" | "series";
    occurrenceId?: string;
    roomId?: string;
    date?: string;
    dayOfWeek?: number;
    startTime?: string;
    endTime?: string;
    section?: string | null;
    note?: string | null;
    studentCount?: number;
  },
  actor: SessionUser,
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id },
        include: { occurrences: true },
      });
      if (!booking) throw notFound("Booking not found");
      if (booking.status === "rejected" || booking.status === "cancelled") {
        throw invalidTransition("This booking is in a terminal state.");
      }

      const scope = body.scope ?? (booking.bookingType === "one_off" ? "series" : "occurrence");
      const startTime = body.startTime ?? hhmm(booking.startTime);
      const endTime = body.endTime ?? hhmm(booking.endTime);
      if (endTime <= startTime) {
        throw validation("endTime must be after startTime", [
          { field: "endTime", message: "must be after startTime" },
        ]);
      }
      if (!isInWindow(startTime) || !isInWindow(endTime)) {
        throw validation("Times must fall within 07:00-21:00");
      }

      const today = todayISO();
      let targets: { id: string; date: string }[];

      if (scope === "occurrence") {
        const occId = body.occurrenceId;
        if (!occId) throw validation("occurrenceId is required for scope=occurrence");
        const occ = booking.occurrences.find((o) => o.id === occId);
        if (!occ) throw notFound("Occurrence not found");
        targets = [{ id: occ.id, date: body.date ?? isoDate(occ.date) }];
      } else {
        // Series move: today-and-future occurrences only; past ones are untouched.
        const future = booking.occurrences.filter(
          (o) => !o.isCancelled && isoDate(o.date) >= today,
        );
        const shift =
          body.dayOfWeek !== undefined && booking.dayOfWeek !== null
            ? body.dayOfWeek - booking.dayOfWeek
            : null;
        targets = future.map((o) => ({
          id: o.id,
          date:
            shift !== null
              ? addDaysISO(isoDate(o.date), shift)
              : (body.date ?? isoDate(o.date)),
        }));
      }

      const roomId = body.roomId ?? booking.roomId;
      const candidates: Candidate[] = targets.map((t) => ({
        roomId,
        date: t.date,
        startTime,
        endTime,
      }));

      // excludeBookingId so the booking never conflicts with itself.
      const { blocking } = await findConflicts(candidates, id, tx);
      if (blocking.length > 0) {
        throw conflict("Cannot move: the target slot clashes with an approved booking.", blocking);
      }

      for (const t of targets) {
        await tx.bookingOccurrence.update({
          where: { id: t.id },
          data: {
            roomId,
            date: dateFromISO(t.date),
            startTime: timeFromHHMM(startTime),
            endTime: timeFromHHMM(endTime),
          },
        });
      }

      const bookingData: Prisma.BookingUpdateInput = {
        section: body.section ?? undefined,
        note: body.note ?? undefined,
        studentCount: body.studentCount ?? undefined,
      };
      if (scope === "series") {
        bookingData.room = { connect: { id: roomId } };
        bookingData.startTime = timeFromHHMM(startTime);
        bookingData.endTime = timeFromHHMM(endTime);
        if (body.dayOfWeek !== undefined) bookingData.dayOfWeek = body.dayOfWeek;
        if (body.date && booking.bookingType === "one_off") {
          bookingData.oneOffDate = dateFromISO(body.date);
        }
      }
      await tx.booking.update({ where: { id }, data: bookingData });

      await tx.bookingEvent.create({
        data: {
          bookingId: id,
          actorId: actor.id,
          eventType: scope === "series" ? "moved_series" : "moved_occurrence",
          newValue: { roomId, startTime, endTime } as Prisma.InputJsonValue,
        },
      });

      const room = await tx.room.findUniqueOrThrow({ where: { id: roomId } });
      const snap = booking.snapshot as unknown as Snapshot;
      await notify(tx, {
        userIds: [booking.instructorId],
        type: "booking_moved",
        message: `Your ${snap.courseCode ?? booking.title} booking was moved to ${
          room.name
        }, ${startTime}-${endTime}`,
        bookingId: id,
        payload: { ...notifyPayload(booking, snap), roomName: room.name, startTime, endTime },
      });

      return await getBookingDetail(id, actor, tx);
    });
  } catch (e) {
    if (isExclusionViolation(e)) {
      throw conflict("Cannot move: that slot is already taken.", []);
    }
    throw e;
  }
}

// ---------------------------------------------------------------- serializers

const bookingInclude = {
  course: true,
  instructor: true,
  room: { include: { building: true } },
  decidedBy: true,
  occurrences: { include: { room: true }, orderBy: { date: "asc" } },
  events: { include: { actor: true }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.BookingInclude;

type BookingWithRefs = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

/** BR-19: prefer live master data, fall back to the snapshot for deactivated/renamed records. */
function serializeBooking(b: BookingWithRefs) {
  const snap = b.snapshot as unknown as Snapshot;
  const instructorName =
    [b.instructor.titlePrefix, b.instructor.name].filter(Boolean).join(" ") ||
    snap.instructorName ||
    "";

  return {
    id: b.id,
    requestNo: b.requestNo,
    status: b.status,
    bookingType: b.bookingType,
    termId: b.termId,
    courseId: b.courseId,
    courseCode: b.course?.code ?? snap.courseCode,
    title: b.title,
    section: b.section,
    instructorId: b.instructorId,
    instructorName,
    requestedBy: b.requestedBy,
    roomId: b.roomId,
    roomName: b.room?.name ?? snap.roomName,
    buildingCode: b.room?.building.code ?? snap.buildingCode,
    roomType: b.room?.roomType ?? null,
    roomCapacity: b.room?.capacity ?? null,
    dayOfWeek: b.dayOfWeek,
    startDate: b.startDate ? isoDate(b.startDate) : null,
    endDate: b.endDate ? isoDate(b.endDate) : null,
    oneOffDate: b.oneOffDate ? isoDate(b.oneOffDate) : null,
    startTime: hhmm(b.startTime),
    endTime: hhmm(b.endTime),
    studentCount: b.studentCount,
    note: b.note,
    rejectReason: b.rejectReason,
    cancelReason: b.cancelReason,
    decidedByName: b.decidedBy?.name ?? null,
    decidedAt: b.decidedAt?.toISOString() ?? null,
    occurrenceCount: b.occurrences.length,
    createdAt: b.createdAt.toISOString(),
  };
}

export async function getBookingDetail(id: string, actor: SessionUser, tx: Tx = prisma) {
  const b = await tx.booking.findUnique({ where: { id }, include: bookingInclude });
  if (!b) throw notFound("Booking not found");

  // Single `staff` role: any authenticated user may read any booking.

  return {
    ...serializeBooking(b),
    occurrences: b.occurrences.map((o) => ({
      occurrenceId: o.id,
      date: isoDate(o.date),
      startTime: hhmm(o.startTime),
      endTime: hhmm(o.endTime),
      roomId: o.roomId,
      roomName: o.room.name,
      isCancelled: o.isCancelled,
    })),
    events: b.events.map((e) => ({
      eventType: e.eventType,
      actorName: e.actor.name,
      reason: e.reason,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

export async function listBookings(
  query: {
    mine?: boolean;
    status?: BookingStatus;
    termId?: string;
    instructorId?: string;
    buildingId?: string;
    sort: "createdAt" | "requestedDate";
    order: "asc" | "desc";
    page: number;
    pageSize: number;
  },
  actor: SessionUser,
) {
  const where: Prisma.BookingWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.termId) where.termId = query.termId;

  // Single `staff` role: staff see every request. "My Requests" opts into own-only scoping
  // with `mine=true`; the Dashboard queue and calendar filters can scope by instructor/building.
  if (query.mine) {
    where.requestedBy = actor.id;
  } else {
    if (query.instructorId) where.instructorId = query.instructorId;
    if (query.buildingId) where.room = { buildingId: query.buildingId };
  }

  const orderBy: Prisma.BookingOrderByWithRelationInput =
    query.sort === "requestedDate"
      ? { startDate: query.order }
      : { createdAt: query.order };

  const [rows, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: bookingInclude,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.booking.count({ where }),
  ]);

  // Drives the unread dot on My Requests / the queue.
  const unread = await prisma.notification.findMany({
    where: { userId: actor.id, isRead: false, bookingId: { in: rows.map((r) => r.id) } },
    select: { bookingId: true },
  });
  const unreadIds = new Set(unread.map((u) => u.bookingId));

  return {
    items: rows.map((b) => ({
      ...serializeBooking(b),
      hasUnreadStatusChange: unreadIds.has(b.id),
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}
