import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";
import { config } from "./config.js";
import { authRoutes } from "./modules/auth/routes.js";
import { bookingRoutes } from "./modules/bookings/routes.js";
import { calendarRoutes } from "./modules/calendar/routes.js";
import { importRoutes } from "./modules/import/routes.js";
import { masterDataRoutes } from "./modules/masterdata/routes.js";
import { notificationRoutes } from "./modules/notifications/routes.js";
import { registerAuth } from "./plugins/auth.js";
import { registerErrorHandler } from "./plugins/errors.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.NODE_ENV === "test" ? false : { level: "info" },
  });

  await app.register(cors, { origin: config.APP_ORIGIN, credentials: true });
  await app.register(cookie);
  await app.register(multipart);

  registerErrorHandler(app);
  registerAuth(app);

  app.get("/health", { config: { auth: "public" } }, async () => ({ ok: true }));

  await app.register(
    async (v1) => {
      await v1.register(authRoutes);
      await v1.register(calendarRoutes);
      await v1.register(bookingRoutes);
      await v1.register(masterDataRoutes);
      await v1.register(notificationRoutes);
      await v1.register(importRoutes);
    },
    { prefix: "/api/v1" },
  );

  return app;
}
