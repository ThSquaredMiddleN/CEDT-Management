import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../db.js";
import { validation } from "../../lib/errors.js";
import { dateFromISO, hhmm, isoDate } from "../../lib/time.js";

/** Accepts `?roomIds=a&roomIds=b` and `?roomIds=a,b`. */
const idList = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => {
    if (!v) return undefined;
    const arr = Array.isArray(v) ? v : [v];
    const flat = arr.flatMap((s) => s.split(",")).map((s) => s.trim()).filter(Boolean);
    return flat.length ? flat : undefined;
  });

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  buildingIds: idList,
  roomIds: idList,
  instructorIds: idList,
  status: z.string().optional(),
  termId: z.string().uuid().optional(),
});

export async function calendarRoutes(app: FastifyInstance): Promise<void> {
  // Public: anyone may read the calendar without logging in. Anonymous visitors only ever
  // see APPROVED bookings; authenticated staff can additionally see pending requests.
  app.get("/calendar", { config: { auth: "public" } }, async (req) => {
    const me = req.user;
    const q = querySchema.parse(req.query);

    const days = (dateFromISO(q.to).getTime() - dateFromISO(q.from).getTime()) / 86_400_000;
    if (days < 0) throw validation("`to` must be on or after `from`");
    if (days > 31) throw validation("Date range must be 31 days or fewer");

    const requested = (q.status?.split(",").map((s) => s.trim()).filter(Boolean) ?? [
      "approved",
      "pending",
    ]) as ("approved" | "pending")[];
    // Not logged in → approved only, regardless of what was asked for.
    const statuses = me ? requested : (["approved"] as ("approved" | "pending")[]);

    const occurrences = await prisma.bookingOccurrence.findMany({
      where: {
        isCancelled: false,
        date: { gte: dateFromISO(q.from), lte: dateFromISO(q.to) },
        ...(q.roomIds ? { roomId: { in: q.roomIds } } : {}),
        ...(q.buildingIds ? { room: { buildingId: { in: q.buildingIds } } } : {}),
        booking: {
          status: { in: statuses },
          ...(q.termId ? { termId: q.termId } : {}),
          ...(q.instructorIds ? { instructorId: { in: q.instructorIds } } : {}),
        },
      },
      include: {
        room: { include: { building: true } },
        booking: { include: { course: true, instructor: true } },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    const serialized = occurrences.flatMap((o) => {
      const b = o.booking;
      const isOwn = me ? b.requestedBy === me.id || b.instructorId === me.id : false;

      // Single `staff` role: every viewer who can see a booking sees it in full. There is no
      // longer any cross-instructor anonymization — the public simply never receives pending
      // bookings (filtered above), and staff see everything.
      return [
        {
          occurrenceId: o.id,
          bookingId: b.id,
          status: b.status as "approved" | "pending",
          date: isoDate(o.date),
          startTime: hhmm(o.startTime),
          endTime: hhmm(o.endTime),
          roomId: o.roomId,
          roomName: o.room.name,
          buildingCode: o.room.building.code,
          courseCode: b.course?.code ?? null,
          title: b.title,
          section: b.section,
          instructorName: [b.instructor.titlePrefix, b.instructor.name]
            .filter(Boolean)
            .join(" "),
          isOwn,
          isTentativeAnonymous: false,
        },
      ];
    });

    return { occurrences: serialized };
  });
}
