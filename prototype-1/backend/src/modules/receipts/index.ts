import { API_PREFIX, type AppModule } from "../types.js";
import { receiptRoutes } from "./routes.js";

export const receiptsModule: AppModule = {
  name: "receipts",
  async setup(app) {
    await app.register(receiptRoutes, { prefix: API_PREFIX });
  },
};
