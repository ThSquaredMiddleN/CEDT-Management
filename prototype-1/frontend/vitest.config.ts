import path from "path";
import { defineConfig } from "vitest/config";

// Unit tests under src/ (storage). test/*.test.mjs run with node --test instead (see package.json).
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  test: { include: ["src/**/*.test.ts"] },
});
