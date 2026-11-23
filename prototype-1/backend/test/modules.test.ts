import type { FastifyInstance, HTTPMethods } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { modules } from "../src/modules/index.js";

/** One known route per module: proves app.ts registers every module under /api/v1. */
const SAMPLE_ROUTES: Record<string, [HTTPMethods, string]> = {
  auth: ["POST", "/api/v1/auth/login"],
  announcements: ["GET", "/api/v1/announcements"],
  news: ["GET", "/api/v1/news"],
  calendar: ["GET", "/api/v1/calendar"],
  bookings: ["GET", "/api/v1/bookings"],
  masterdata: ["GET", "/api/v1/rooms"],
  notifications: ["GET", "/api/v1/notifications"],
  import: ["POST", "/api/v1/import/courses"],
  course_change: ["GET", "/api/v1/course-change/requests"],
  line: ["POST", "/api/v1/line/webhook"],
  receipts: ["GET", "/api/v1/receipts"],
};

let app: FastifyInstance;
beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe("module registry", () => {
  it("lists every module once", () => {
    const names = modules.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
    expect([...names].sort()).toEqual(Object.keys(SAMPLE_ROUTES).sort());
  });
  it("registers each module's routes under /api/v1", () => {
    for (const [name, [method, url]] of Object.entries(SAMPLE_ROUTES)) {
      expect(app.hasRoute({ method, url }), `${name}: ${method} ${url}`).toBe(true);
    }
  });
});
