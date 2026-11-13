import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../db.js";
import { requireUser } from "../../plugins/auth.js";

const listQuery = z.object({
  unreadOnly: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const readSchema = z.union([
  z.object({ ids: z.array(z.string().uuid()).min(1) }),
  z.object({ all: z.literal(true) }),
]);

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/notifications", { config: { auth: "user" } }, async (req) => {
    const me = requireUser(req);
    const q = listQuery.parse(req.query);

    const where = { userId: me.id, ...(q.unreadOnly ? { isRead: false } : {}) };

    const [items, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId: me.id, isRead: false } }),
    ]);

    return {
      items: items.map((n) => ({
        id: n.id,
        type: n.type,
        message: n.message,
        bookingId: n.bookingId,
        courseChangeRequestId: n.courseChangeRequestId,
        payload: n.payload,
        isRead: n.isRead,
        createdAt: n.createdAt.toISOString(),
      })),
      unreadCount,
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  });

  app.post("/notifications/read", { config: { auth: "user" } }, async (req, reply) => {
    const me = requireUser(req);
    const body = readSchema.parse(req.body);

    await prisma.notification.updateMany({
      // Scoped to the caller's own notifications either way.
      where: { userId: me.id, ...("all" in body ? {} : { id: { in: body.ids } }) },
      data: { isRead: true },
    });

    return reply.code(204).send();
  });
}
