import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { loginCookie } from "./fixtures.js";

/**
 * LINE is off when the secret or the token is unset. `lineEnabled` is computed once, when config.ts is first
 * imported, so this file stubs the env and re-imports the app. vi.stubEnv is undone in afterAll, and the module
 * registry is reset per file, so the other test files keep the fake LINE credentials from vitest.config.ts.
 */
let app: FastifyInstance | undefined;
let cookie = "";

beforeAll(async () => {
  vi.stubEnv("LINE_CHANNEL_SECRET", "");
  vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "");
  vi.resetModules();
  const { buildApp } = await import("../../src/app.js");
  app = await buildApp();
  await app.ready();
  // Unmatched routes run the global auth check first, so anonymous requests would get 401, not 404.
  cookie = await loginCookie(app, "somchai@cedt.edu", "instr1234");
});

afterAll(async () => {
  await app?.close();
  vi.unstubAllEnvs();
});

describe("LINE disabled", () => {
  it("does not register the webhook route", () => {
    expect(app!.hasRoute({ method: "POST", url: "/api/v1/line/webhook" })).toBe(false);
  });

  it("answers 404 for the webhook with a signed-in session", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/api/v1/line/webhook",
      headers: {
        cookie,
        "content-type": "application/json",
        "x-line-signature": "not-checked",
        "x-requested-with": "XMLHttpRequest",
      },
      payload: JSON.stringify({ destination: "U00000000000000000000000000000000", events: [] }),
    });
    expect(res.statusCode).toBe(404);
  });

  it("keeps the status route, which reports LINE as disabled", async () => {
    expect(app!.hasRoute({ method: "GET", url: "/api/v1/line/status" })).toBe(true);
    const res = await app!.inject({ method: "GET", url: "/api/v1/line/status", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ enabled: false });
  });

  it("registers the link check route, which answers valid: false for any token", async () => {
    expect(app!.hasRoute({ method: "POST", url: "/api/v1/line/link/check" })).toBe(true);
    const res = await app!.inject({
      method: "POST",
      url: "/api/v1/line/link/check",
      headers: { "content-type": "application/json", "x-requested-with": "XMLHttpRequest" },
      payload: JSON.stringify({ token: randomBytes(32).toString("base64url") }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ valid: false });
  });
});
