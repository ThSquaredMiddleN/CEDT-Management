import { CORE_PERMISSIONS, CORE_ROW_LABELS, type PermissionDef } from "../core/permissions.js";
import { accessModule } from "./access/index.js";
import { announcementsModule } from "./announcements/index.js";
import { authModule } from "./auth/index.js";
import { bookingsModule } from "./bookings/index.js";
import { calendarModule } from "./calendar/index.js";
import { courseChangeModule } from "./course-change/index.js";
import { importModule } from "./import/index.js";
import { lineModule } from "./line/index.js";
import { masterdataModule } from "./masterdata/index.js";
import { newsModule } from "./news/index.js";
import { notificationsModule } from "./notifications/index.js";
import { receiptsModule } from "./receipts/index.js";
import type { AppModule } from "./types.js";

/** Every module, in registration order. Adding a module is one line here. */
export const modules: AppModule[] = [
  authModule,
  announcementsModule,
  newsModule,
  calendarModule,
  bookingsModule,
  masterdataModule,
  notificationsModule,
  importModule,
  courseChangeModule,
  lineModule,
  receiptsModule,
  accessModule,
];

/** Every permission the code knows: core's plus each module's. */
export const permissionCatalog: PermissionDef[] = [...CORE_PERMISSIONS, ...modules.flatMap((m) => m.permissions ?? [])];

/** Thai row labels for the permission table, by row (module name or core row). */
export const permissionRowLabels: Record<string, string> = {
  ...CORE_ROW_LABELS,
  ...Object.fromEntries(modules.filter((m) => m.label).map((m) => [m.name, m.label!])),
};
