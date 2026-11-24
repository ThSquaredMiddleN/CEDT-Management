import { API_PREFIX, type AppModule } from "../types.js";
import { bookingRoutes } from "./routes.js";

export const bookingsModule: AppModule = {
  name: "bookings",
  label: "จองห้อง",
  permissions: [
    { key: "bookings.use", label: "ขอจองห้อง" },
    { key: "bookings.view", label: "ดูคำขอจองทั้งหมด" },
    { key: "bookings.manage", label: "อนุมัติ ปฏิเสธ และย้ายการจอง" },
  ],
  async setup(app) {
    await app.register(bookingRoutes, { prefix: API_PREFIX });
  },
};
