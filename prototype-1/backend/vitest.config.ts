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

export default defineConfig({
  test: {
    // The integration tests share one Postgres, so they run serially.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Fake LINE credentials, set after the .env spread so a real secret or token is never used by tests.
    env: {
      ...loadDotEnv(),
      NODE_ENV: "test",
      LINE_CHANNEL_SECRET: "test-line-channel-secret",
      LINE_CHANNEL_ACCESS_TOKEN: "test-line-access-token",
    },
  },
});
