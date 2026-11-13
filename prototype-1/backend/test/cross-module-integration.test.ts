import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db.js";

/**
 * Integration of Course Change with the rest of LabSync after merging main: the auth matrix
 * across modules (a `student` role now exists next to `staff`) and the Announcements API end to
 * end on Zod 4. Runs against the isolated test database (`npm run test:fresh`).
 */

let app: FastifyInstance;
let staff: string;
let student: string;
const createdAnnouncements: string[] = [];

async function login(email: string, password: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: { "x-requested-with": "XMLHttpRequest" },
    payload: { email, password },
  });
  expect(res.statusCode).toBe(200);
  return `labsync_session=${res.cookies.find((c) => c.name === "labsync_session")!.value}`;
}

const call = (method: "GET" | "POST" | "PATCH", url: string, cookie?: string, payload?: object) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(method === "GET" ? {} : { "x-requested-with": "XMLHttpRequest" }),
    },
    ...(payload ? { payload } : {}),
  });

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  staff = await login("admin@cedt.edu", "admin1234");
  student = await login("student3@cedt.edu", "student1234");
});

afterAll(async () => {
  await prisma.announcement.deleteMany({ where: { id: { in: createdAnnouncements } } });
  await app.close();
  await prisma.$disconnect();
});

describe("auth matrix across modules", () => {
  const staffOnly: [string, string][] = [
    ["GET", "/announcements"],
    ["GET", "/bookings"],
    ["GET", "/users"],
    ["GET", "/course-change/settings"],
  ];

  it.each(staffOnly)("%s %s: anonymous 401, student 403, staff 200", async (method, url) => {
    expect((await call(method as "GET", url)).statusCode).toBe(401);
    expect((await call(method as "GET", url, student)).statusCode).toBe(403);
    expect((await call(method as "GET", url, staff)).statusCode).toBe(200);
  });

  it("keeps student-only Course Change endpoints closed to staff", async () => {
    expect((await call("GET", "/course-change/eligible-courses?type=drop", staff)).statusCode).toBe(403);
    expect((await call("GET", "/course-change/eligible-courses?type=drop", student)).statusCode).toBe(200);
  });

  it("lets both roles read their own session and notifications", async () => {
    for (const cookie of [staff, student]) {
      expect((await call("GET", "/auth/me", cookie)).json().user).not.toBeNull();
      expect((await call("GET", "/notifications", cookie)).statusCode).toBe(200);
    }
  });

  it("shows students only approved bookings on the public calendar", async () => {
    const q = "/calendar?from=2026-08-17&to=2026-08-23";
    const anon = (await call("GET", q)).json().occurrences as { status: string }[];
    const asStudent = (await call("GET", q, student)).json().occurrences as { status: string }[];
    const asStaff = (await call("GET", q, staff)).json().occurrences as { status: string }[];
    expect(asStudent.every((o) => o.status === "approved")).toBe(true);
    expect(asStudent).toHaveLength(anon.length);
    expect(asStaff.some((o) => o.status === "pending")).toBe(true);
  });
});

describe("Announcements API on Zod 4", () => {
  it("creates, reads, updates and publishes an announcement", async () => {
    const created = await call("POST", "/announcements", staff, {
      title: "  ทดสอบประกาศ  ",
      content: "<p>รายละเอียด</p>",
      audiences: ["year3"],
    });
    expect(created.statusCode).toBe(201);
    const a = created.json().announcement;
    createdAnnouncements.push(a.id);
    expect(a).toMatchObject({ title: "ทดสอบประกาศ", status: "draft", audiences: ["year3"] });

    expect((await call("GET", `/announcements/${a.id}`, staff)).json().announcement.id).toBe(a.id);

    const updated = await call("PATCH", `/announcements/${a.id}`, staff, { audiences: ["all"] });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().announcement).toMatchObject({ title: "ทดสอบประกาศ", audiences: ["all"] });

    const published = await call("POST", `/announcements/${a.id}/publish`, staff);
    expect(published.statusCode).toBe(200);
    expect(published.json().announcement.status).toBe("published");
  });

  it("returns the 422 validation envelope with field paths for bad input", async () => {
    const res = await call("POST", "/announcements", staff, { title: "", content: "x", audiences: [] });
    expect(res.statusCode).toBe(422);
    const { error } = res.json();
    expect(error.code).toBe("VALIDATION");
    const fields = (error.details as { field: string }[]).map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(["title", "audiences"]));
  });

  it("rejects an empty update and a malformed id", async () => {
    const list = (await call("GET", "/announcements", staff)).json().items as { id: string }[];
    expect((await call("PATCH", `/announcements/${list[0]!.id}`, staff, {})).statusCode).toBe(422);
    expect((await call("GET", "/announcements/not-a-uuid", staff)).statusCode).toBe(422);
  });
});
