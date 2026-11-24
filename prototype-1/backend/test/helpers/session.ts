import type { FastifyInstance } from "fastify";
import { expect } from "vitest";
import { TEST_PASSWORD } from "../../prisma/seed-test-accounts.js";

/** Logs in and returns the Cookie header value. Test accounts use TEST_PASSWORD by default. */
export async function loginAs(app: FastifyInstance, email: string, password = TEST_PASSWORD): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: { "x-requested-with": "XMLHttpRequest" },
    payload: { email, password },
  });
  expect(res.statusCode, `login ${email}`).toBe(200);
  const cookie = res.cookies.find((c) => c.name === "labsync_session");
  return `labsync_session=${cookie!.value}`;
}

export const idOf = async (
  prisma: { user: { findUniqueOrThrow(a: { where: { email: string } }): Promise<{ id: string }> } },
  email: string,
): Promise<string> => (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
