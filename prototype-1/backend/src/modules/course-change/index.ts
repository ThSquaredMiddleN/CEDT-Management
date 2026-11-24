import { API_PREFIX, type AppModule } from "../types.js";
import { courseChangeRoutes } from "./routes.js";

export const courseChangeModule: AppModule = {
  name: "course_change",
  label: "ลด-ถอนรายวิชา",
  permissions: [
    { key: "course_change.use", label: "ยื่นคำร้อง" },
    { key: "course_change.view", label: "ดูคำร้องทั้งหมด" },
    { key: "course_change.manage", label: "ดำเนินการคำร้อง" },
    { key: "course_change.manage.advise", label: "พิจารณาในฐานะอาจารย์ที่ปรึกษา" },
  ],
  async setup(app) {
    await app.register(courseChangeRoutes, { prefix: API_PREFIX });
  },
};
