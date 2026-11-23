import { API_PREFIX, type AppModule } from "../types.js";
import { announcementRoutes } from "./routes.js";

export const announcementsModule: AppModule = {
  name: "announcements",
  async setup(app) {
    await app.register(announcementRoutes, { prefix: API_PREFIX });
  },
};
