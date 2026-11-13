import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

/** Every invocation owns a new disposable database; never reset an existing database. */
const devUrl = process.env.DATABASE_URL;
if (!devUrl) throw new Error("DATABASE_URL is required");
const name = `labsync_verify_${randomUUID().replaceAll("-", "")}_test`;
if (!/^labsync_verify_[a-f0-9]{32}_test$/.test(name)) throw new Error("Invalid scratch database name");
const adminUrl = new URL(devUrl);
adminUrl.pathname = "/postgres";
const testUrl = new URL(devUrl);
testUrl.pathname = `/${name}`;
const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });
let created = false;
try {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  created = true;
  const env = { ...process.env, DATABASE_URL: testUrl.toString(), TEST_DATABASE_URL: testUrl.toString(), NODE_ENV: "test" };
  console.log("Preparing a new isolated test database (no demo data will be changed).");
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env, stdio: "inherit" });
  execFileSync("npx", ["tsx", "prisma/seed.ts"], { env, stdio: "inherit" });
  execFileSync("npx", ["vitest", "run", ...process.argv.slice(2)], { env, stdio: "inherit" });
} catch (error) {
  process.exitCode = 1;
  console.error(error instanceof Error && "status" in error ? "Fresh test run failed; see diagnostics above." : "Could not prepare or clean up the isolated test database.");
} finally {
  if (created) {
    try {
      await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
      console.log("Removed only this run's disposable test database.");
    } catch {
      process.exitCode = 1;
      console.error(`Test database cleanup failed: ${name}`);
    }
  }
  await admin.$disconnect();
}
