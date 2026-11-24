import { API_PREFIX, type AppModule } from "../types.js";
import { newsRoutes } from "./routes.js";

export const newsModule: AppModule = {
  name: "news",
  label: "ข่าวประชาสัมพันธ์",
  permissions: [
    { key: "news.view", label: "ดูข่าวฝั่งเจ้าหน้าที่" },
    { key: "news.manage", label: "สร้าง แก้ไข และเผยแพร่ข่าว" },
  ],
  async setup(app) {
    await app.register(newsRoutes, { prefix: API_PREFIX });
  },
};
