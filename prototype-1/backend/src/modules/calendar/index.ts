import { API_PREFIX, type AppModule } from "../types.js";
import { calendarRoutes } from "./routes.js";

export const calendarModule: AppModule = {
  name: "calendar",
  async setup(app) {
    await app.register(calendarRoutes, { prefix: API_PREFIX });
  },
};
