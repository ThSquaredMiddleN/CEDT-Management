import { API_PREFIX, type AppModule } from "../types.js";
import { startExpiryJob } from "./job.js";
import { storageRoutes } from "./routes.js";

export const storageModule: AppModule = {
  name: "storage",
  label: "คลังอุปกรณ์",
  permissions: [
    { key: "storage.use", label: "ยืมอุปกรณ์ (ฝั่งนิสิต)" },
    { key: "storage.view", label: "ดูคลังอุปกรณ์ฝั่งเจ้าหน้าที่" },
    { key: "storage.manage.counter", label: "จ่ายและรับคืนอุปกรณ์" },
    { key: "storage.manage.qc", label: "ตรวจสภาพอุปกรณ์" },
    { key: "storage.manage.inventory", label: "จัดการรายการอุปกรณ์และตั้งค่า" },
    { key: "storage.manage.payment", label: "ยืนยันการชำระค่าปรับ" },
  ],
  async setup(app) {
    await app.register(storageRoutes, { prefix: `${API_PREFIX}/storage` });
    startExpiryJob(app);
  },
};
