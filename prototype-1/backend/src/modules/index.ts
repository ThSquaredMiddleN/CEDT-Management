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
];
