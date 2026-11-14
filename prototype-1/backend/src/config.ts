import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ORIGIN: z.string().default("http://localhost:5173"),
  SESSION_COOKIE_NAME: z.string().default("labsync_session"),
  SESSION_TTL_HOURS: z.coerce.number().default(168),
  APP_TZ: z.string().default("Asia/Bangkok"),
  // Receipts carry names and student IDs (PDPA): the OCR sidecar must run on this machine.
  OCR_SERVICE_URL: z
    .string()
    .url()
    .refine((u) => ["127.0.0.1", "localhost", "[::1]"].includes(new URL(u).hostname), {
      message: "OCR_SERVICE_URL must point at localhost (receipts must not leave this machine)",
    })
    .default("http://127.0.0.1:8790"),
  OCR_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
  RECEIPT_RETENTION_DAYS: z.coerce.number().int().positive().default(365),
});

export const config = schema.parse(process.env);
export const isProd = config.NODE_ENV === "production";
