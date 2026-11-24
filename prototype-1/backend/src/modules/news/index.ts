import { API_PREFIX, type AppModule } from "../types.js";
import { newsRoutes } from "./routes.js";

export const newsModule: AppModule = {
  name: "news",
  async setup(app) {
    await app.register(newsRoutes, { prefix: API_PREFIX });
  },
};
