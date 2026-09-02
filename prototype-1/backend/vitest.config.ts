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
    env: { ...loadDotEnv(), NODE_ENV: "test" },
  },
});
