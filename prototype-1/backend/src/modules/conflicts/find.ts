import { Prisma } from "@prisma/client";
import { prisma, type Tx } from "../../db.js";
import { hhmm, isoDate } from "../../lib/time.js";
import type { Candidate } from "./expand.js";

export interface ConflictEntry {
  date: string;
  roomName: string;
  existing: {
    courseCode: string | null;
    title: string;
    startTime: string;
    endTime: string;
    dayOfWeek: number | null;
  };
}

export interface PendingOverlap {
  date: string;
  startTime: string;
  endTime: string;
}

export interface AlternativeRoom {
  roomId: string;
  roomName: string;
  buildingCode: string;
  capacity: number;
}

/** Build the `(room_id, date, start_ts, end_ts)` VALUES list shared by every conflict query. */
function candidateValues(candidates: Candidate[]): Prisma.Sql {
  return Prisma.join(
    candidates.map(
      (c) => Prisma.sql`(
        ${c.roomId}::uuid,
        ${c.date}::date,
        ((${c.date}::date + ${c.startTime}::time) AT TIME ZONE 'Asia/Bangkok'),
        ((${c.date}::date + ${c.endTime}::time)   AT TIME ZONE 'Asia/Bangkok')
      )`,
    ),
    ", ",
  );
}

interface BlockingRow {
  candidate_date: Date;
  room_name: string;
  course_code: string | null;
  title: string;
  start_time: Date;
  end_time: Date;
  day_of_week: number | null;
}

/**
 * BR-6: the single conflict function behind all four call sites
 * (form check, submit, approve, admin move).
 *
 * `blocking` = overlaps with occurrences of APPROVED bookings (BR-1) — these reject.
 * `pending`  = overlaps with occurrences of PENDING bookings (BR-3) — informational only.
 */
export async function findConflicts(
  candidates: Candidate[],
  excludeBookingId: string | null = null,
  tx: Tx = prisma,
): Promise<{ blocking: ConflictEntry[]; pending: PendingOverlap[] }> {
  if (candidates.length === 0) return { blocking: [], pending: [] };

  const values = candidateValues(candidates);
  const exclude = excludeBookingId ?? null;

  // SQL(A) — blocking conflicts: one round-trip for any number of candidates.
  const blockingRows = await tx.$queryRaw<BlockingRow[]>`
    SELECT c.date AS candidate_date,
           r.name AS room_name,
           co.code AS course_code,
           b.title,
           o.start_time,
           o.end_time,
           b.day_of_week
    FROM (VALUES ${values}) AS c(room_id, date, start_ts, end_ts)
    JOIN booking_occurrences o
      ON o.room_id = c.room_id
     AND o.is_blocking
     AND o.timeslot && tstzrange(c.start_ts, c.end_ts, '[)')
    JOIN bookings b ON b.id = o.booking_id
    JOIN rooms r    ON r.id = o.room_id
    LEFT JOIN courses co ON co.id = b.course_id
    WHERE b.id IS DISTINCT FROM ${exclude}::uuid
    ORDER BY c.date
  `;

  // SQL(B) — pending overlaps: same shape, but against pending (non-blocking) occurrences.
  const pendingRows = await tx.$queryRaw<
    { candidate_date: Date; start_time: Date; end_time: Date }[]
  >`
    SELECT c.date AS candidate_date, o.start_time, o.end_time
    FROM (VALUES ${values}) AS c(room_id, date, start_ts, end_ts)
    JOIN booking_occurrences o
      ON o.room_id = c.room_id
     AND NOT o.is_cancelled
     AND o.timeslot && tstzrange(c.start_ts, c.end_ts, '[)')
    JOIN bookings b ON b.id = o.booking_id AND b.status = 'pending'
    WHERE b.id IS DISTINCT FROM ${exclude}::uuid
    ORDER BY c.date
  `;

  return {
    blocking: blockingRows.map((r) => ({
      date: isoDate(r.candidate_date),
      roomName: r.room_name,
      existing: {
        courseCode: r.course_code,
        title: r.title,
        startTime: hhmm(r.start_time),
        endTime: hhmm(r.end_time),
        dayOfWeek: r.day_of_week,
      },
    })),
    pending: pendingRows.map((r) => ({
      date: isoDate(r.candidate_date),
      startTime: hhmm(r.start_time),
      endTime: hhmm(r.end_time),
    })),
  };
}

/**
 * BR-10: up to 3 rooms that are active, big enough, and free across ALL candidate
 * occurrences. Same building first, then smallest sufficient room.
 */
export async function findAlternativeRooms(
  candidates: Candidate[],
  requestedRoomId: string,
  studentCount: number,
  tx: Tx = prisma,
): Promise<AlternativeRoom[]> {
  if (candidates.length === 0) return [];

  const dateValues = Prisma.join(
    candidates.map(
      (c) => Prisma.sql`(
        ((${c.date}::date + ${c.startTime}::time) AT TIME ZONE 'Asia/Bangkok'),
        ((${c.date}::date + ${c.endTime}::time)   AT TIME ZONE 'Asia/Bangkok')
      )`,
    ),
    ", ",
  );

  const rows = await tx.$queryRaw<
    { id: string; name: string; capacity: number; building_code: string }[]
  >`
    SELECT r.id, r.name, r.capacity, bl.code AS building_code
    FROM rooms r
    JOIN buildings bl ON bl.id = r.building_id
    WHERE r.is_active
      AND r.id <> ${requestedRoomId}::uuid
      AND r.capacity >= ${studentCount}
      AND NOT EXISTS (
        SELECT 1
        FROM (VALUES ${dateValues}) AS c(start_ts, end_ts)
        JOIN booking_occurrences o
          ON o.room_id = r.id
         AND o.is_blocking
         AND o.timeslot && tstzrange(c.start_ts, c.end_ts, '[)')
      )
    ORDER BY (bl.id = (SELECT building_id FROM rooms WHERE id = ${requestedRoomId}::uuid)) DESC,
             r.capacity ASC
    LIMIT 3
  `;

  return rows.map((r) => ({
    roomId: r.id,
    roomName: r.name,
    buildingCode: r.building_code,
    capacity: r.capacity,
  }));
}
