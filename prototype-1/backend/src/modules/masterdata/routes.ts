import argon2 from "argon2";
import type { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../db.js";
import { duplicate, isUniqueViolation, needsConfirm, notFound } from "../../lib/errors.js";
import { dateFromISO, hhmm, isoDate, todayISO } from "../../lib/time.js";
import { requireUser } from "../../plugins/auth.js";

const idParam = z.object({ id: z.string().uuid() });

/**
 * BR-14: deactivating a course/room that future APPROVED bookings depend on returns the
 * affected list as 409 NEEDS_CONFIRM; the client resends with `confirm: true`.
 */
async function assertDeactivationConfirmed(
  where: { courseId?: string; roomId?: string },
  confirm: boolean | undefined,
  label: string,
): Promise<void> {
  if (confirm) return;

  const occs = await prisma.bookingOccurrence.findMany({
    where: {
      isCancelled: false,
      date: { gte: dateFromISO(todayISO()) },
      ...(where.roomId ? { roomId: where.roomId } : {}),
      booking: {
        status: "approved",
        ...(where.courseId ? { courseId: where.courseId } : {}),
      },
    },
    include: { booking: { include: { course: true } }, room: true },
    orderBy: { date: "asc" },
  });
  if (occs.length === 0) return;

  const byBooking = new Map<string, (typeof occs)[number]>();
  for (const o of occs) if (!byBooking.has(o.bookingId)) byBooking.set(o.bookingId, o);

  throw needsConfirm(
    `${label} is used by ${byBooking.size} future approved booking(s).`,
    [...byBooking.values()].map((o) => ({
      bookingId: o.bookingId,
      requestNo: o.booking.requestNo,
      courseCode: o.booking.course?.code ?? null,
      title: o.booking.title,
      nextDate: isoDate(o.date),
      roomName: o.room.name,
      startTime: hhmm(o.startTime),
      endTime: hhmm(o.endTime),
    })),
  );
}

const courseCreate = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  defaultInstructorId: z.string().uuid().nullable().optional(),
});
const coursePatch = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  defaultInstructorId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  confirm: z.boolean().optional(),
});

const roomCreate = z.object({
  buildingId: z.string().uuid(),
  name: z.string().min(1),
  capacity: z.number().int().min(1),
  roomType: z.enum(["lecture", "lab", "hardware", "meeting"]),
  equipment: z.array(z.string()).default([]),
});
const roomPatch = roomCreate.partial().extend({
  isActive: z.boolean().optional(),
  confirm: z.boolean().optional(),
});

const buildingCreate = z.object({ code: z.string().min(1), name: z.string().min(1) });
const buildingPatch = buildingCreate.partial().extend({ isActive: z.boolean().optional() });

const termCreate = z.object({
  academicYear: z.number().int(),
  termNumber: z.number().int().min(1).max(3),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isActive: z.boolean().default(false),
});
const termPatch = termCreate.partial();

const userCreate = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  titlePrefix: z.string().nullable().optional(),
  role: z.enum(["staff"]).default("staff"),
  password: z.string().min(8),
});
const userPatch = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  titlePrefix: z.string().nullable().optional(),
  role: z.enum(["staff"]).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

const serializeTerm = (t: {
  id: string;
  academicYear: number;
  termNumber: number;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
}) => ({
  id: t.id,
  academicYear: t.academicYear,
  termNumber: t.termNumber,
  name: `${t.academicYear} / Term ${t.termNumber}`,
  startDate: isoDate(t.startDate),
  endDate: isoDate(t.endDate),
  isActive: t.isActive,
});

export async function masterDataRoutes(app: FastifyInstance): Promise<void> {
  // ------------------------------------------------------------------ courses
  app.get("/courses", { config: { auth: "any" } }, async (req) => {
    const q = z
      .object({ q: z.string().optional(), active: z.string().optional() })
      .parse(req.query);

    const where: Prisma.CourseWhereInput = {};
    if (q.active !== "all") where.isActive = q.active === "false" ? false : true;
    if (q.q) {
      where.OR = [
        { code: { contains: q.q, mode: "insensitive" } },
        { name: { contains: q.q, mode: "insensitive" } },
      ];
    }

    const items = await prisma.course.findMany({
      where,
      include: { defaultInstructor: true },
      orderBy: { code: "asc" },
    });

    return {
      items: items.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        isActive: c.isActive,
        defaultInstructor: c.defaultInstructor
          ? {
              id: c.defaultInstructor.id,
              name: c.defaultInstructor.name,
              titlePrefix: c.defaultInstructor.titlePrefix,
            }
          : null,
      })),
    };
  });

  app.post("/courses", { config: { auth: "admin" } }, async (req, reply) => {
    const body = courseCreate.parse(req.body);
    try {
      const c = await prisma.course.create({
        data: { ...body, defaultInstructorId: body.defaultInstructorId ?? null },
        include: { defaultInstructor: true },
      });
      return reply.code(201).send({ course: c });
    } catch (e) {
      if (isUniqueViolation(e)) throw duplicate("This code already exists");
      throw e;
    }
  });

  app.patch("/courses/:id", { config: { auth: "admin" } }, async (req) => {
    const { id } = idParam.parse(req.params);
    const { confirm, ...body } = coursePatch.parse(req.body);

    if (body.isActive === false) {
      await assertDeactivationConfirmed({ courseId: id }, confirm, "Course");
    }
    try {
      const course = await prisma.course.update({
        where: { id },
        data: body,
        include: { defaultInstructor: true },
      });
      return { course };
    } catch (e) {
      if (isUniqueViolation(e)) throw duplicate("This code already exists");
      throw e;
    }
  });

  // -------------------------------------------------------------------- rooms
  // Public: the anonymous calendar needs room/building metadata for its filters and lanes.
  app.get("/rooms", { config: { auth: "public" } }, async (req) => {
    const q = z
      .object({
        buildingId: z.string().uuid().optional(),
        active: z.string().optional(),
        minCapacity: z.coerce.number().int().optional(),
      })
      .parse(req.query);

    const where: Prisma.RoomWhereInput = {};
    if (q.buildingId) where.buildingId = q.buildingId;
    if (q.active === "true") where.isActive = true;
    if (q.active === "false") where.isActive = false;
    if (q.minCapacity) where.capacity = { gte: q.minCapacity };

    const items = await prisma.room.findMany({
      where,
      include: { building: true },
      orderBy: { name: "asc" },
    });

    return {
      items: items.map((r) => ({
        id: r.id,
        name: r.name,
        buildingId: r.buildingId,
        buildingCode: r.building.code,
        capacity: r.capacity,
        roomType: r.roomType,
        equipment: r.equipment,
        isActive: r.isActive,
      })),
    };
  });

  app.post("/rooms", { config: { auth: "admin" } }, async (req, reply) => {
    const body = roomCreate.parse(req.body);
    try {
      const room = await prisma.room.create({ data: body, include: { building: true } });
      return reply.code(201).send({ room });
    } catch (e) {
      if (isUniqueViolation(e)) throw duplicate("A room with that name already exists");
      throw e;
    }
  });

  app.patch("/rooms/:id", { config: { auth: "admin" } }, async (req) => {
    const { id } = idParam.parse(req.params);
    const { confirm, ...body } = roomPatch.parse(req.body);

    if (body.isActive === false) {
      await assertDeactivationConfirmed({ roomId: id }, confirm, "Room");
    }
    try {
      const room = await prisma.room.update({
        where: { id },
        data: body,
        include: { building: true },
      });
      return { room };
    } catch (e) {
      if (isUniqueViolation(e)) throw duplicate("A room with that name already exists");
      throw e;
    }
  });

  // ---------------------------------------------------------------- buildings
  app.get("/buildings", { config: { auth: "public" } }, async () => ({
    items: await prisma.building.findMany({ orderBy: { code: "asc" } }),
  }));

  app.post("/buildings", { config: { auth: "admin" } }, async (req, reply) => {
    const body = buildingCreate.parse(req.body);
    try {
      return reply.code(201).send({ building: await prisma.building.create({ data: body }) });
    } catch (e) {
      if (isUniqueViolation(e)) throw duplicate("This code already exists");
      throw e;
    }
  });

  app.patch("/buildings/:id", { config: { auth: "admin" } }, async (req) => {
    const { id } = idParam.parse(req.params);
    const body = buildingPatch.parse(req.body);
    try {
      return { building: await prisma.building.update({ where: { id }, data: body }) };
    } catch (e) {
      if (isUniqueViolation(e)) throw duplicate("This code already exists");
      throw e;
    }
  });

  // -------------------------------------------------------------------- terms
  app.get("/terms", { config: { auth: "public" } }, async () => {
    const items = await prisma.term.findMany({
      orderBy: [{ academicYear: "desc" }, { termNumber: "desc" }],
    });
    return { items: items.map(serializeTerm) };
  });

  app.post("/terms", { config: { auth: "admin" } }, async (req, reply) => {
    const body = termCreate.parse(req.body);
    const term = await prisma.$transaction(async (tx) => {
      // Only one term may be active (partial unique index enforces it).
      if (body.isActive) {
        await tx.term.updateMany({ where: { isActive: true }, data: { isActive: false } });
      }
      return tx.term.create({
        data: {
          academicYear: body.academicYear,
          termNumber: body.termNumber,
          startDate: dateFromISO(body.startDate),
          endDate: dateFromISO(body.endDate),
          isActive: body.isActive,
        },
      });
    });
    return reply.code(201).send({ term: serializeTerm(term) });
  });

  app.patch("/terms/:id", { config: { auth: "admin" } }, async (req) => {
    const { id } = idParam.parse(req.params);
    const body = termPatch.parse(req.body);

    const term = await prisma.$transaction(async (tx) => {
      // Activating a term atomically deactivates the previous one.
      if (body.isActive === true) {
        await tx.term.updateMany({
          where: { isActive: true, id: { not: id } },
          data: { isActive: false },
        });
      }
      return tx.term.update({
        where: { id },
        data: {
          academicYear: body.academicYear,
          termNumber: body.termNumber,
          startDate: body.startDate ? dateFromISO(body.startDate) : undefined,
          endDate: body.endDate ? dateFromISO(body.endDate) : undefined,
          isActive: body.isActive,
        },
      });
    });
    return { term: serializeTerm(term) };
  });

  // -------------------------------------------------------------------- users
  app.get("/users", { config: { auth: "any" } }, async (req) => {
    requireUser(req);
    const q = z
      .object({
        role: z.enum(["staff"]).optional(),
        active: z.string().optional(),
        q: z.string().optional(),
      })
      .parse(req.query);

    const where: Prisma.UserWhereInput = {};
    if (q.role) where.role = q.role;
    if (q.active === "true") where.isActive = true;
    if (q.active === "false") where.isActive = false;
    if (q.q) where.name = { contains: q.q, mode: "insensitive" };

    const users = await prisma.user.findMany({ where, orderBy: { name: "asc" } });

    // Single `staff` role: every authenticated user gets the full projection.
    return {
      items: users.map((u) => ({
        id: u.id,
        name: u.name,
        titlePrefix: u.titlePrefix,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        createdAt: u.createdAt.toISOString(),
      })),
    };
  });

  app.post("/users", { config: { auth: "admin" } }, async (req, reply) => {
    const body = userCreate.parse(req.body);
    try {
      const user = await prisma.user.create({
        data: {
          name: body.name,
          email: body.email,
          titlePrefix: body.titlePrefix ?? null,
          role: body.role,
          passwordHash: await argon2.hash(body.password, { type: argon2.argon2id }),
        },
      });
      return reply.code(201).send({
        user: {
          id: user.id,
          name: user.name,
          titlePrefix: user.titlePrefix,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
        },
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw duplicate("This email is already registered");
      throw e;
    }
  });

  app.patch("/users/:id", { config: { auth: "admin" } }, async (req) => {
    const { id } = idParam.parse(req.params);
    const body = userPatch.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw notFound("User not found");

    try {
      const user = await prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id },
          data: {
            name: body.name,
            email: body.email,
            titlePrefix: body.titlePrefix,
            role: body.role,
            isActive: body.isActive,
            ...(body.password
              ? { passwordHash: await argon2.hash(body.password, { type: argon2.argon2id }) }
              : {}),
          },
        });
        // BR-14: deactivating a user revokes their live sessions immediately.
        if (body.isActive === false) {
          await tx.session.deleteMany({ where: { userId: id } });
        }
        return updated;
      });

      return {
        user: {
          id: user.id,
          name: user.name,
          titlePrefix: user.titlePrefix,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
        },
      };
    } catch (e) {
      if (isUniqueViolation(e)) throw duplicate("This email is already registered");
      throw e;
    }
  });
}
