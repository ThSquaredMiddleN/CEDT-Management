import { API_PREFIX, type AppModule } from "../types.js";
import { masterDataRoutes } from "./routes.js";

export const masterdataModule: AppModule = {
  name: "masterdata",
  label: "ข้อมูลหลัก",
  permissions: [
    { key: "masterdata.manage", label: "จัดการอาคาร ห้อง เทอม และวิชา" },
  ],
  async setup(app) {
    await app.register(masterDataRoutes, { prefix: API_PREFIX });
  },
};
