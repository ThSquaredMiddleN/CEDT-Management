import type { FastifyInstance } from "fastify";
import { requireUser } from "../../plugins/auth.js";
import {
  announcementCreateSchema,
  announcementIdSchema,
  announcementUpdateSchema,
} from "./schemas.js";
import {
  createAnnouncement,
  getAnnouncement,
  listAnnouncements,
  publishAnnouncement,
  updateAnnouncement,
} from "./service.js";

export async function announcementRoutes(app: FastifyInstance): Promise<void> {
  app.get("/announcements", { config: { auth: "admin" } }, async () => listAnnouncements());

  app.get("/announcements/:id", { config: { auth: "admin" } }, async (req) => {
    const { id } = announcementIdSchema.parse(req.params);
    return getAnnouncement(id);
  });

  app.post("/announcements", { config: { auth: "admin" } }, async (req, reply) => {
    const input = announcementCreateSchema.parse(req.body);
    const user = requireUser(req);
    return reply.code(201).send(await createAnnouncement(user.id, input));
  });

  app.patch("/announcements/:id", { config: { auth: "admin" } }, async (req) => {
    const { id } = announcementIdSchema.parse(req.params);
    const input = announcementUpdateSchema.parse(req.body);
    return updateAnnouncement(id, input);
  });

  app.post("/announcements/:id/publish", { config: { auth: "admin" } }, async (req) => {
    const { id } = announcementIdSchema.parse(req.params);
    return publishAnnouncement(id);
  });
}
