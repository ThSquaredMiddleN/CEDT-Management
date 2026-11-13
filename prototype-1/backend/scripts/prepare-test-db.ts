import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { testDatabaseUrl } from "../vitest.config.js";

/**
 * Creates (if missing), migrates and seeds the isolated test database `<db>_test` on the same
 * Postgres server as the dev database. Never touches the dev database itself, never drops
 * anything, and never prints the connection string (it contains the password).
 */

const devUrl = process.env.DATABASE_URL;
if (!devUrl) throw new Error("DATABASE_URL is not set (run via `npm run test:prepare`)");

const testUrl = testDatabaseUrl(devUrl);
const testDb = new URL(testUrl).pathname.slice(1);
if (!testDb.endsWith("_test")) throw new Error(`Refusing to prepare non-test database "${testDb}"`);

// Connect to the server's maintenance DB to create the test DB if it does not exist yet.
const admin = new URL(devUrl);
admin.pathname = "/postgres";
const prisma = new PrismaClient({ datasources: { db: { url: admin.toString() } } });
const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
  SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = ${testDb}) AS exists`;
if (!rows[0]?.exists) {
  // Identifier is validated above (ends with _test, derived from our own URL).
  await prisma.$executeRawUnsafe(`CREATE DATABASE "${testDb}"`);
  console.log(`Created database ${testDb}`);
} else {
  console.log(`Database ${testDb} already exists`);
}
await prisma.$disconnect();

const env = { ...process.env, DATABASE_URL: testUrl };
execFileSync("npx", ["prisma", "migrate", "deploy"], { env, stdio: "inherit" });
execFileSync("npx", ["tsx", "prisma/seed.ts"], { env, stdio: "inherit" });
console.log(`Test database ${testDb} is migrated and seeded.`);
