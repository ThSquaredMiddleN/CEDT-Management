import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../../plugins/auth.js";
import {
  approveBooking,
  cancelBooking,
  checkConflicts,
  createBooking,
  getBookingDetail,
  listBookings,
  patchBooking,
  rejectBooking,
} from "./service.js";
import {
  bookingInputSchema,
  cancelSchema,
  checkConflictsSchema,
  listQuerySchema,
  patchBookingSchema,
  rejectSchema,
} from "./schemas.js";

const idParam = z.object({ id: z.string().uuid() });

export async function bookingRoutes(app: FastifyInstance): Promise<void> {
  app.post("/bookings", { config: { auth: "any" } }, async (req, reply) => {
    const me = requireUser(req);
    const input = bookingInputSchema.parse(req.body);
    const booking = await createBooking(input, me);
    return reply.code(201).send({ booking });
  });

  app.post("/bookings/check-conflicts", { config: { auth: "any" } }, async (req) => {
    const input = checkConflictsSchema.parse(req.body);
    return checkConflicts(input);
  });

  app.get("/bookings", { config: { auth: "any" } }, async (req) => {
    const me = requireUser(req);
    return listBookings(listQuerySchema.parse(req.query), me);
  });

  app.get("/bookings/:id", { config: { auth: "any" } }, async (req) => {
    const me = requireUser(req);
    const { id } = idParam.parse(req.params);
    return { booking: await getBookingDetail(id, me) };
  });

  app.patch("/bookings/:id", { config: { auth: "admin" } }, async (req) => {
    const me = requireUser(req);
    const { id } = idParam.parse(req.params);
    const body = patchBookingSchema.parse(req.body ?? {});
    return { booking: await patchBooking(id, body, me) };
  });

  app.post("/bookings/:id/approve", { config: { auth: "admin" } }, async (req) => {
    const me = requireUser(req);
    const { id } = idParam.parse(req.params);
    return { booking: await approveBooking(id, me) };
  });

  app.post("/bookings/:id/reject", { config: { auth: "admin" } }, async (req) => {
    const me = requireUser(req);
    const { id } = idParam.parse(req.params);
    const { reason } = rejectSchema.parse(req.body);
    return { booking: await rejectBooking(id, reason, me) };
  });

  app.post("/bookings/:id/cancel", { config: { auth: "any" } }, async (req) => {
    const me = requireUser(req);
    const { id } = idParam.parse(req.params);
    const body = cancelSchema.parse(req.body ?? {});
    return { booking: await cancelBooking(id, body, me) };
  });
}
