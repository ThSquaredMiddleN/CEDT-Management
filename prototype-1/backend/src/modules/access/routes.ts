import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createRole, getRole, getUserAccess, listRoles, saveUserAccess, updateRole } from "../../core/access.js";
import { buildCatalogRows } from "../../core/permission-layout.js";
import { prisma } from "../../db.js";
import { requireUser } from "../../plugins/auth.js";

const MANAGE = { auth: "user", permission: "core.permissions.manage" } as const;
const idParam = z.object({ id: z.string().uuid() });
const reason = z.string().max(500).nullable().default(null);
const userSave = z.object({ roleIds: z.array(z.string().uuid()), permissions: z.array(z.string()), reason });
const roleCreate = z.object({
  key: z.string(),
  name: z.string().max(100),
  description: z.string().max(500).nullable().default(null),
  permissions: z.array(z.string()),
  reason: z.string().max(500),
});
const roleUpdate = roleCreate.omit({ key: true }).extend({ isActive: z.boolean(), reason });

export async function accessRoutes(app: FastifyInstance): Promise<void> {
  const { catalog, rowLabels, keys } = app.permissionCatalog;

  app.get("/access/catalog", { config: MANAGE }, async () => ({ rows: buildCatalogRows(catalog, rowLabels) }));

  app.get("/access/users", { config: MANAGE }, async (req) => {
    const { q } = z.object({ q: z.string().trim().max(100).default("") }).parse(req.query);
    if (!q) return { items: [] };
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { studentNo: { startsWith: q } },
        ],
      },
      include: { roles: { include: { role: { select: { name: true } } } } },
      orderBy: { name: "asc" },
      take: 10,
    });
    return {
      items: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        studentNo: u.studentNo,
        isActive: u.isActive,
        roles: u.roles.map((a) => a.role.name),
      })),
    };
  });

  app.get("/access/users/:id", { config: MANAGE }, async (req) => getUserAccess(idParam.parse(req.params).id));

  app.put("/access/users/:id", { config: MANAGE }, async (req) =>
    (await saveUserAccess(requireUser(req), idParam.parse(req.params).id, userSave.parse(req.body), keys)).access,
  );

  app.get("/access/roles", { config: MANAGE }, async () => ({ items: await listRoles() }));

  app.get("/access/roles/:id", { config: MANAGE }, async (req) => getRole(idParam.parse(req.params).id));

  app.post("/access/roles", { config: MANAGE }, async (req, reply) =>
    reply.code(201).send((await createRole(requireUser(req), roleCreate.parse(req.body), keys)).role),
  );

  app.put("/access/roles/:id", { config: MANAGE }, async (req) =>
    (await updateRole(requireUser(req), idParam.parse(req.params).id, roleUpdate.parse(req.body), keys)).role,
  );
}
