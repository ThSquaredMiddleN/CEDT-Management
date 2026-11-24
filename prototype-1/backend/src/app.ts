import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";
import { config } from "./config.js";
import { modules } from "./modules/index.js";
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
  registerAuth(app);

  app.get("/health", { config: { auth: "public" } }, async () => ({ ok: true }));

  for (const mod of modules) {
    await mod.setup(app, opts);
  }

  return app;
}
