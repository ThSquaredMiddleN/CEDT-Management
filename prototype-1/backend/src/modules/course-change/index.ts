import { API_PREFIX, type AppModule } from "../types.js";
import { courseChangeRoutes } from "./routes.js";

export const courseChangeModule: AppModule = {
  name: "course_change",
  async setup(app) {
    await app.register(courseChangeRoutes, { prefix: API_PREFIX });
  },
};
