import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { loginCookie } from "./fixtures.js";

/**
 * addFriendUrl is built from LINE_OA_BASIC_ID when config.ts is first imported, so each describe below stubs the
 * env and re-imports the app. LINE stays enabled here (the fake credentials from vitest.config.ts), because the
 * link is only built when LINE is on. vi.stubEnv is undone in afterAll, and the module registry is reset per
 * describe, so the other test files keep the shared config.
 */
let app: FastifyInstance | undefined;
let cookie = "";

const get = (url: string) => app!.inject({ method: "GET", url, headers: { cookie } });

describe("addFriendUrl when LINE_OA_BASIC_ID is set", () => {
  beforeAll(async () => {
    vi.stubEnv("LINE_OA_BASIC_ID", "@073fmhna");
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

  it("is the add-friend link with the basic ID encoded", async () => {
    expect((await get("/api/v1/line/status")).json()).toMatchObject({
      addFriendUrl: "https://line.me/R/ti/p/%40073fmhna",
    });
  });
});

describe("addFriendUrl when LINE_OA_BASIC_ID is unset", () => {
  beforeAll(async () => {
    vi.stubEnv("LINE_OA_BASIC_ID", "");
    vi.resetModules();
    const { buildApp } = await import("../../src/app.js");
    app = await buildApp();
    await app.ready();
    cookie = await loginCookie(app, "somchai@cedt.edu", "instr1234");
  });

  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });

  it("is null", async () => {
    expect((await get("/api/v1/line/status")).json()).toMatchObject({ addFriendUrl: null });
  });
});
