import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";
import { config } from "./config.js";
import { warnUnknownPermissions } from "./core/permissions.js";
import { modules, permissionCatalog, permissionRowLabels } from "./modules/index.js";
import type { BuildOptions } from "./modules/types.js";
import { registerAuth } from "./plugins/auth.js";
import { registerErrorHandler } from "./plugins/errors.js";

export type { BuildOptions } from "./modules/types.js";

export async function buildApp(opts: BuildOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: config.NODE_ENV === "test" ? false : { level: "info" } });

  await app.register(cors, { origin: config.APP_ORIGIN, credentials: true });
  await app.register(cookie);
  await app.register(multipart);

  registerErrorHandler(app);
  const knownPermissions = new Set(permissionCatalog.map((p) => p.key));
  registerAuth(app, knownPermissions);
  app.addHook("onReady", async () => {
    if (config.NODE_ENV !== "test") await warnUnknownPermissions(app, knownPermissions);
  });

  app.get("/health", { config: { auth: "public" } }, async () => ({ ok: true }));

  app.decorate("permissionCatalog", { catalog: permissionCatalog, rowLabels: permissionRowLabels, keys: knownPermissions });

  for (const mod of modules) {
    await mod.setup(app, opts);
  }

  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    /** Declared permissions, attached here so modules need not import modules/index.ts. */
    permissionCatalog: {
      catalog: import("./core/permissions.js").PermissionDef[];
      rowLabels: Record<string, string>;
      keys: ReadonlySet<string>;
    };
  }
}
