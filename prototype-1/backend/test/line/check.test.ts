import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import { hashToken } from "../../src/plugins/auth.js";
import {
  cleanLineState,
  fakeLine,
  lineEvent,
  LINE_A,
  LINE_B,
  loginCookie,
  postWebhook,
  tokenFrom,
  webhookBody,
  type FakeLine,
} from "./fixtures.js";

/** Seeded staff account. Its LINE fields are reset to null after every test. */
const SOMCHAI = { email: "somchai@cedt.edu", password: "instr1234" };

let app: FastifyInstance;
let line: FakeLine;
let somchaiCookie: string;

const check = (payload: unknown, cookie?: string) =>
  app.inject({
    method: "POST",
    url: "/api/v1/line/link/check",
    headers: { ...(cookie ? { cookie } : {}), "x-requested-with": "XMLHttpRequest" },
    payload: payload as object,
  });

/** Sends the body as-is (not serialised by inject), so JSON null, strings and arrays reach the parser unchanged. */
const checkRaw = (body: string) =>
  app.inject({
    method: "POST",
    url: "/api/v1/line/link/check",
    headers: { "content-type": "application/json", "x-requested-with": "XMLHttpRequest" },
    payload: body,
  });

const link = (payload: unknown, cookie: string) =>
  app.inject({
    method: "POST",
    url: "/api/v1/line/link",
    headers: { cookie, "x-requested-with": "XMLHttpRequest" },
    payload: payload as object,
  });

/** Issues a link for `lineUserId` through the webhook (a follow) and returns the raw token it was sent. */
async function issueToken(lineUserId: string): Promise<string> {
  line.reset();
  const res = await postWebhook(app, webhookBody([lineEvent({ type: "follow", userId: lineUserId })]));
  expect(res.statusCode).toBe(200);
  const raw = tokenFrom(line.sent[0]!.text);
  expect(raw).toBeDefined();
  return raw!;
}

beforeAll(async () => {
  line = fakeLine();
  app = await buildApp({ lineClient: line.client });
  await app.ready();
  await cleanLineState();
  somchaiCookie = await loginCookie(app, SOMCHAI.email, SOMCHAI.password);
});

beforeEach(async () => {
  line.reset();
  await cleanLineState();
});

afterAll(async () => {
  await cleanLineState();
  await app.close();
});

describe("POST /line/link/check", () => {
  it("reports a fresh token as valid, with no session", async () => {
    const raw = await issueToken(LINE_A);
    const res = await check({ token: raw });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ valid: true });
  });

  it("returns exactly the key `valid` and nothing about the account or token", async () => {
    const raw = await issueToken(LINE_A);
    const res = await check({ token: raw });
    expect(Object.keys(res.json())).toEqual(["valid"]);
    expect(res.body).not.toContain(LINE_A);
    expect(res.body).not.toContain(SOMCHAI.email);
    expect(res.body).not.toContain("expiresAt");
  });

  it("an expired token is valid: false", async () => {
    const raw = randomBytes(32).toString("base64url");
    await prisma.lineLinkToken.create({
      data: {
        tokenHash: hashToken(raw),
        lineUserId: LINE_B,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    const res = await check({ token: raw });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ valid: false });
  });

  it("a used token is valid: false", async () => {
    const raw = await issueToken(LINE_A);
    expect((await link({ token: raw }, somchaiCookie)).statusCode).toBe(200);

    const res = await check({ token: raw });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ valid: false });
  });

  it("an unknown token is valid: false", async () => {
    const res = await check({ token: "no-such-token" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ valid: false });
  });

  it("a missing or malformed body is rejected the same way as POST /line/link", async () => {
    const bodies: unknown[] = [{}, { token: "" }, { token: 123 }, { token: "x".repeat(201) }];
    for (const body of bodies) {
      const res = await check(body);
      // ZodError maps to 422 for both routes; the schema is shared, so the status must match.
      expect(res.statusCode).toBe(422);
      expect(res.statusCode).toBe((await link(body, somchaiCookie)).statusCode);
    }
  });

  it("is read-only: a check does not consume the token, so Confirm still links it", async () => {
    const raw = await issueToken(LINE_A);

    expect((await check({ token: raw })).json()).toEqual({ valid: true });
    expect((await check({ token: raw })).json()).toEqual({ valid: true });
    const row = await prisma.lineLinkToken.findUniqueOrThrow({ where: { tokenHash: hashToken(raw) } });
    expect(row.usedAt).toBeNull();

    const res = await link({ token: raw }, somchaiCookie);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ linked: true });
    expect((await check({ token: raw })).json()).toEqual({ valid: false });
  });

  it("keeps CSRF on: a request without X-Requested-With is 403", async () => {
    const raw = await issueToken(LINE_A);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/line/link/check",
      payload: { token: raw },
    });
    expect(res.statusCode).toBe(403);
  });

  it("a signed-in session gets the same answer, and the token is still unused afterwards", async () => {
    const raw = await issueToken(LINE_A);
    const res = await check({ token: raw }, somchaiCookie);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ valid: true });

    const row = await prisma.lineLinkToken.findUniqueOrThrow({ where: { tokenHash: hashToken(raw) } });
    expect(row.usedAt).toBeNull();
  });

  it("a token expiring exactly now, or 1 ms ago, is valid: false", async () => {
    const now = Date.now();
    for (const expiresAt of [new Date(now), new Date(now - 1)]) {
      const raw = randomBytes(32).toString("base64url");
      await prisma.lineLinkToken.create({
        data: { tokenHash: hashToken(raw), lineUserId: LINE_B, expiresAt },
      });

      const res = await check({ token: raw });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ valid: false });
    }
  });

  it("a non-object JSON body (null, string, array) is 422, never 500", async () => {
    // Fastify parses these as valid JSON, so the schema check runs and rejects them like any other malformed body.
    for (const body of ["null", '"token"', '["token"]']) {
      const res = await checkRaw(body);
      expect(res.statusCode).toBe(422);
    }
  });

  it("GET /line/link/check is not a route: 404 with a signed-in session", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/line/link/check",
      headers: { cookie: somchaiCookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it("a rejected body does not echo the submitted token", async () => {
    const submitted = `probe-check-${"x".repeat(200)}`;
    const res = await check({ token: submitted });
    expect(res.statusCode).toBe(422);
    expect(res.body).not.toContain("probe-check");
    expect(res.body).not.toContain(submitted);
  });
});
