import { z } from "zod";

/** An empty env value (e.g. `LINE_LINK_TTL_MINUTES=`) counts as unset and takes the default. */
const emptyAsUnset = (v: unknown) => (v === "" ? undefined : v);
const positiveNumber = (fallback: number) =>
  z.preprocess(emptyAsUnset, z.coerce.number().min(1).default(fallback));

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ORIGIN: z.string().default("http://localhost:5173"),
  SESSION_COOKIE_NAME: z.string().default("labsync_session"),
  SESSION_TTL_HOURS: z.coerce.number().default(168),
  APP_TZ: z.string().default("Asia/Bangkok"),
  // LINE is optional: it runs only when both the secret and the token are set (see lineEnabled).
  LINE_CHANNEL_SECRET: z.string().optional(),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().optional(),
  LINE_LINK_TTL_MINUTES: positiveNumber(15),
  LINE_DISPATCH_INTERVAL_MS: positiveNumber(5000),
});

export const config = schema.parse(process.env);
export const isProd = config.NODE_ENV === "production";
export const lineEnabled = Boolean(config.LINE_CHANNEL_SECRET && config.LINE_CHANNEL_ACCESS_TOKEN);
