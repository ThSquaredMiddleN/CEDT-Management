import { API_PREFIX, type AppModule } from "../types.js";
import { notificationRoutes } from "./routes.js";

export const notificationsModule: AppModule = {
  name: "notifications",
  async setup(app) {
    await app.register(notificationRoutes, { prefix: API_PREFIX });
  },
};
