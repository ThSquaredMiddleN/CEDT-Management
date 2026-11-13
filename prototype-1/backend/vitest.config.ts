import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

/** Vitest does not read .env into process.env, and the app config requires DATABASE_URL. */
function loadDotEnv(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(".env", "utf8")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
        }),
    );
  } catch {
    return {};
  }
}

/**
 * Tests never touch the development database: they run against `<db>_test` on the same Postgres
 * server (prepare it once with `npm run test:prepare`). TEST_DATABASE_URL overrides the derived URL.
 */
export function testDatabaseUrl(devUrl: string): string {
  const url = new URL(devUrl);
  const db = url.pathname.slice(1);
  url.pathname = `/${db.endsWith("_test") ? db : `${db}_test`}`;
  return url.toString();
}

const dotEnv = loadDotEnv();
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? (dotEnv.DATABASE_URL ? testDatabaseUrl(dotEnv.DATABASE_URL) : "");

export default defineConfig({
  test: {
    // Built JavaScript must never replay integration fixtures a second time.
    include: ["test/**/*.test.ts"],
    // The integration tests share one Postgres, so they run serially.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Course Change routing depends on "today": pin it to week 9 of the seeded term (2026/1).
    env: {
      ...dotEnv,
      DATABASE_URL: TEST_DATABASE_URL,
      NODE_ENV: "test",
      COURSE_CHANGE_TODAY: "2026-09-30",
    },
  },
});
