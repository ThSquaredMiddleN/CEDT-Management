import { API_PREFIX, type AppModule } from "../types.js";
import { masterDataRoutes } from "./routes.js";

export const masterdataModule: AppModule = {
  name: "masterdata",
  async setup(app) {
    await app.register(masterDataRoutes, { prefix: API_PREFIX });
  },
};
