import { API_PREFIX, type AppModule } from "../types.js";
import { importRoutes } from "./routes.js";

export const importModule: AppModule = {
  name: "import",
  async setup(app) {
    await app.register(importRoutes, { prefix: API_PREFIX });
  },
};
