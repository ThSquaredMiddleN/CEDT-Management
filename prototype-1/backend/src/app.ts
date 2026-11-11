import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";
import { config, lineDryRun } from "./config.js";
import { prisma } from "./db.js";
import { authRoutes } from "./modules/auth/routes.js";
import { bookingRoutes } from "./modules/bookings/routes.js";
import { calendarRoutes } from "./modules/calendar/routes.js";
import { importRoutes } from "./modules/import/routes.js";
import { createDryRunLineClient, createLineClient, type LineClient } from "./modules/line/client.js";
import { startLineDispatcher } from "./modules/line/dispatcher.js";
import { lineRoutes } from "./modules/line/routes.js";
import { masterDataRoutes } from "./modules/masterdata/routes.js";
import { notificationRoutes } from "./modules/notifications/routes.js";
import { registerAuth } from "./plugins/auth.js";
import { registerErrorHandler } from "./plugins/errors.js";

export interface BuildOptions {
  /** Tests pass a fake LINE client so no request leaves the process. */
  lineClient?: LineClient;
}

export async function buildApp(opts: BuildOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.NODE_ENV === "test" ? false : { level: "info" },
  });

  await app.register(cors, { origin: config.APP_ORIGIN, credentials: true });
  await app.register(cookie);
  await app.register(multipart);

  registerErrorHandler(app);
  registerAuth(app);

  app.get("/health", { config: { auth: "public" } }, async () => ({ ok: true }));

  // LINE_DRY_RUN: prints each message to this console instead of sending it (see createDryRunLineClient).
  const dryRunClient = lineDryRun ? createDryRunLineClient(app.log) : undefined;
  if (lineDryRun) app.log.warn("LINE is in dry-run mode: nothing is sent; replies and pushes are printed here");

  await app.register(
    async (v1) => {
      await v1.register(authRoutes);
      await v1.register(calendarRoutes);
      await v1.register(bookingRoutes);
      await v1.register(masterDataRoutes);
      await v1.register(notificationRoutes);
      await v1.register(importRoutes);
      await v1.register(lineRoutes, { client: opts.lineClient ?? dryRunClient });
    },
    { prefix: "/api/v1" },
  );

  // Starts on ready only when LINE is enabled and not under test (see startLineDispatcher).
  startLineDispatcher(app, {
    prisma,
    client: opts.lineClient ?? dryRunClient ?? createLineClient(config.LINE_CHANNEL_ACCESS_TOKEN ?? ""),
    appOrigin: config.APP_ORIGIN,
    intervalMs: config.LINE_DISPATCH_INTERVAL_MS,
  });

  return app;
}
