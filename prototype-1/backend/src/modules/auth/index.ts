import { API_PREFIX, type AppModule } from "../types.js";
import { authRoutes } from "./routes.js";

export const authModule: AppModule = {
  name: "auth",
  async setup(app) {
    await app.register(authRoutes, { prefix: API_PREFIX });
  },
};
