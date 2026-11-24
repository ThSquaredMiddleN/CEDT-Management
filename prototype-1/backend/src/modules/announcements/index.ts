import { API_PREFIX, type AppModule } from "../types.js";
import { announcementRoutes } from "./routes.js";

export const announcementsModule: AppModule = {
  name: "announcements",
  label: "ประกาศ",
  permissions: [
    { key: "announcements.view", label: "ดูประกาศฝั่งเจ้าหน้าที่" },
    { key: "announcements.manage", label: "สร้าง แก้ไข และเผยแพร่ประกาศ" },
  ],
  async setup(app) {
    await app.register(announcementRoutes, { prefix: API_PREFIX });
  },
};
