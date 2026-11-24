import { API_PREFIX, type AppModule } from "../types.js";
import { receiptRoutes } from "./routes.js";

export const receiptsModule: AppModule = {
  name: "receipts",
  label: "ใบเสร็จ",
  permissions: [
    { key: "receipts.view", label: "ดูผลตรวจใบเสร็จ" },
    { key: "receipts.manage", label: "ตรวจและลบใบเสร็จ" },
    { key: "receipts.use", label: "ส่งใบเสร็จค่าเทอมของตัวเอง" },
  ],
  async setup(app) {
    await app.register(receiptRoutes, { prefix: API_PREFIX });
  },
};
