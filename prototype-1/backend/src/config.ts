import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ORIGIN: z.string().default("http://localhost:5173"),
  SESSION_COOKIE_NAME: z.string().default("labsync_session"),
  SESSION_TTL_HOURS: z.coerce.number().default(168),
  APP_TZ: z.string().default("Asia/Bangkok"),
  // Course Change demo/test hook: pretend "today" is this date (YYYY-MM-DD) so any week of
  // the term — and therefore any of flows A/B/C — can be shown on demand. Unset = real date.
  COURSE_CHANGE_TODAY: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export const config = schema.parse(process.env);
export const isProd = config.NODE_ENV === "production";
