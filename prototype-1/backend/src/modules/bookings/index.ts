import { API_PREFIX, type AppModule } from "../types.js";
import { bookingRoutes } from "./routes.js";

export const bookingsModule: AppModule = {
  name: "bookings",
  async setup(app) {
    await app.register(bookingRoutes, { prefix: API_PREFIX });
  },
};
