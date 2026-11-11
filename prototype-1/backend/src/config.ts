import { z } from "zod";

/** An empty env value (e.g. `LINE_LINK_TTL_MINUTES=`) counts as unset and takes the default. */
const emptyAsUnset = (v: unknown) => (v === "" ? undefined : v);
const positiveNumber = (fallback: number) =>
  z.preprocess(emptyAsUnset, z.coerce.number().min(1).default(fallback));
const flag = z.preprocess(emptyAsUnset, z.enum(["true", "1", "false", "0"]).default("false"));

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ORIGIN: z.string().default("http://localhost:5173"),
  SESSION_COOKIE_NAME: z.string().default("labsync_session"),
  SESSION_TTL_HOURS: z.coerce.number().default(168),
  APP_TZ: z.string().default("Asia/Bangkok"),
  // LINE is optional: it runs when the secret is set and either the token or LINE_DRY_RUN is set (see lineEnabled).
  LINE_CHANNEL_SECRET: z.string().optional(),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().optional(),
  // Local only: LINE replies and pushes are printed to the console instead of sent (see lineDryRun).
  LINE_DRY_RUN: flag.transform((v) => v === "true" || v === "1"),
  LINE_LINK_TTL_MINUTES: positiveNumber(15),
  LINE_DISPATCH_INTERVAL_MS: positiveNumber(5000),
});

export const config = schema.parse(process.env);
export const isProd = config.NODE_ENV === "production";
// Dry-run logs one-time link tokens and LINE IDs and marks every notification delivered without sending it.
if (isProd && config.LINE_DRY_RUN) {
  throw new Error("LINE_DRY_RUN must not be set in production");
}
export const lineEnabled = Boolean(
  config.LINE_CHANNEL_SECRET && (config.LINE_CHANNEL_ACCESS_TOKEN || config.LINE_DRY_RUN),
);
/** Dry-run wins over a token: with LINE_DRY_RUN=true nothing goes to the network, even if a token is set. */
export const lineDryRun = lineEnabled && config.LINE_DRY_RUN;
