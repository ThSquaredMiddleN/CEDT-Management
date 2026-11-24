import { API_PREFIX, type AppModule } from "../types.js";
import { accessRoutes } from "./routes.js";

/** Role and permission management (/admin/access). Its permissions are core's (CORE_PERMISSIONS). */
export const accessModule: AppModule = {
  name: "core",
  async setup(app) {
    await app.register(accessRoutes, { prefix: API_PREFIX });
  },
};
