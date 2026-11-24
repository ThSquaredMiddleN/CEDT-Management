import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db.js";

/** Accounts without a password (MCV-only, step 2 of the shared-objects plan). */
const email = `mcv-only-${randomUUID().slice(0, 8)}@example.test`;
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  await prisma.user.create({ data: { email, name: "MCV only" } });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await app.close();
  await prisma.$disconnect();
});

const login = (password: string) =>
  app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: { "x-requested-with": "XMLHttpRequest" },
    payload: { email, password },
  });

describe("login for an account with no password", () => {
  it("gets the same generic 401 and does not count as a failed attempt", async () => {
    for (let i = 0; i < 6; i++) {
      const res = await login("anything-at-all");
      expect(res.statusCode).toBe(401);
      expect(res.json().error.message).toBe("Invalid email or password");
    }
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.failedLoginCount).toBe(0);
    expect(user.lockedUntil).toBeNull();
  });
});
