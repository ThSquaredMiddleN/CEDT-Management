import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { loginAs } from "../helpers/session.js";
import { resetStorage } from "./helpers.js";

let app: FastifyInstance;
const cookies: Record<string, string> = {};

beforeAll(async () => {
  app = await buildApp();
  for (const who of ["student", "student2", "ta", "storekeeper", "norole"]) cookies[who] = await loginAs(app, `${who}@test.local`);
});
afterAll(async () => app.close());
beforeEach(resetStorage);

const call = (who: string, method: "GET" | "POST" | "PUT", url: string, payload?: unknown, csrf = true) =>
  app.inject({
    method,
    url: `/api/v1/storage${url}`,
    headers: { cookie: cookies[who]!, ...(csrf ? { "x-requested-with": "XMLHttpRequest" } : {}) },
    payload: payload as never,
  });

describe("storage routes", () => {
  it("gives students the slim catalog only", async () => {
    const res = await call("student", "GET", "/catalog");
    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.json()[0]).sort()).toEqual(["available", "id", "isUnique", "name", "total"]);
  });

  it("refuses users without the permission (403)", async () => {
    expect((await call("norole", "GET", "/catalog")).statusCode).toBe(403);
    expect((await call("ta", "POST", "/walk-in", { studentId: "6800000001", groupId: "personal", lines: [] })).statusCode).toBe(403);
    expect((await call("ta", "POST", "/qc/REQ-R-202/verify-slip", { valid: true })).statusCode).toBe(403);
    expect((await call("student", "GET", "/requests")).statusCode).toBe(403);
    expect((await call("ta", "GET", "/requests")).statusCode).toBe(200); // storage.view
  });

  it("returns 404 for another student's request", async () => {
    expect((await call("student", "POST", "/my/requests/REQ-B-103/cancel")).statusCode).toBe(404);
    expect((await call("ta", "POST", "/my/requests/REQ-B-103/cancel")).statusCode).toBe(200);
  });

  it("validates bodies and requires the CSRF header", async () => {
    expect((await call("storekeeper", "POST", "/requests/REQ-B-101/reject", { reason: "   " })).statusCode).toBe(422);
    expect((await call("storekeeper", "POST", "/requests/REQ-B-101/reject", { reason: "x" }, false)).statusCode).toBe(403);
    const ok = await call("storekeeper", "POST", "/requests/REQ-B-101/reject", { reason: "ไม่มีรายวิชานี้" });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ status: "REJECTED", rejectReason: "ไม่มีรายวิชานี้" });
  });

  it("returns money in satang and the student's own data", async () => {
    expect((await call("storekeeper", "GET", "/qc/REQ-R-202")).json()).toMatchObject({ fineAmount: 150000 });
    const me = (await call("student2", "GET", "/me")).json();
    expect(me.groups.map((g: { label: string }) => g.label)).toEqual(["Group 09", "ชมรมหุ่นยนต์", "ส่วนตัว"]);
    expect((await call("student", "GET", "/my/owed")).json()).toHaveLength(2);
  });

  it("creates a request and runs the counter flow end to end", async () => {
    const created = await call("student", "POST", "/my/requests", { groupId: "personal", items: [{ itemId: "EQ-004", qty: 1 }] });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    const issued = await call("storekeeper", "POST", `/requests/${id}/issue`, {
      lines: [{ itemId: "EQ-004", qty: 1, sns: ["EQ-004-001"] }],
      pickup: { pickupAt: "2026-11-30T10:00:00+07:00", location: "counter", remark: "" },
    });
    expect(issued.statusCode).toBe(200);
    expect((await call("student", "POST", `/my/requests/${id}/pickup`)).json()).toMatchObject({ status: "CLOSED" });
    expect((await call("storekeeper", "GET", "/students/6800000001/owed")).json()).toHaveLength(3);
  });
});
