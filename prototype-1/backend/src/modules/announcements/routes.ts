import type { FastifyInstance } from "fastify";
import { can } from "../../core/permissions.js";
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
  app.get("/announcements", { config: { auth: "public" } }, async (req) =>
    listAnnouncements({ publishedOnly: !can(req.user, "announcements.view") }),
  );

  app.get("/announcements/:id", { config: { auth: "public" } }, async (req) => {
    const { id } = announcementIdSchema.parse(req.params);
    return getAnnouncement(id, { publishedOnly: !can(req.user, "announcements.view") });
  });

  app.post("/announcements", { config: { auth: "user", permission: "announcements.manage" } }, async (req, reply) => {
    const input = announcementCreateSchema.parse(req.body);
    const user = requireUser(req);
    return reply.code(201).send(await createAnnouncement(user.id, input));
  });

  app.patch("/announcements/:id", { config: { auth: "user", permission: "announcements.manage" } }, async (req) => {
    const { id } = announcementIdSchema.parse(req.params);
    const input = announcementUpdateSchema.parse(req.body);
    return updateAnnouncement(id, input);
  });

  app.post("/announcements/:id/publish", { config: { auth: "user", permission: "announcements.manage" } }, async (req) => {
    const { id } = announcementIdSchema.parse(req.params);
    return publishAnnouncement(id);
  });
}
