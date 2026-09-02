import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db.js";

/**
 * Critical-path integration test against the local Postgres. Assumes `npm run db:seed` has run.
 *
 * Model under test: a single `staff` role (every login can book AND manage; bookings
 * auto-approve on submit) plus an anonymous PUBLIC calendar that only ever shows approved
 * bookings. `staffA` / `staffB` below are just two seeded staff accounts.
 */

let app: FastifyInstance;

async function login(email: string, password: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: { "x-requested-with": "XMLHttpRequest" },
    payload: { email, password },
  });
  expect(res.statusCode).toBe(200);
  const cookie = res.cookies.find((c) => c.name === "labsync_session");
  return `labsync_session=${cookie!.value}`;
}

const post = (url: string, cookie: string, payload?: unknown) =>
  app.inject({
    method: "POST",
    url,
    headers: { cookie, "x-requested-with": "XMLHttpRequest" },
    payload: payload ?? {},
  });

const get = (url: string, cookie?: string) =>
  app.inject({ method: "GET", url, headers: cookie ? { cookie } : {} });

let staffA: string;
let staffB: string;
let ids: { term: string; course: string; anucha: string; room301: string };

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  staffA = await login("anucha@cedt.edu", "instr1234");
  staffB = await login("admin@cedt.edu", "admin1234");

  const terms = (await get("/api/v1/terms", staffA)).json() as {
    items: { id: string; isActive: boolean }[];
  };
  const courses = (await get("/api/v1/courses?q=CEDT205", staffA)).json() as {
    items: { id: string }[];
  };
  const users = (await get("/api/v1/users?role=staff", staffA)).json() as {
    items: { id: string; name: string }[];
  };
  const rooms = (await get("/api/v1/rooms", staffA)).json() as {
    items: { id: string; name: string }[];
  };

  ids = {
    term: terms.items.find((t) => t.isActive)!.id,
    course: courses.items[0]!.id,
    anucha: users.items.find((u) => u.name.includes("Anucha"))!.id,
    room301: rooms.items.find((r) => r.name === "E12-301")!.id,
  };
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

const draft = (startTime: string, endTime: string) => ({
  bookingType: "recurring" as const,
  termId: ids.term,
  courseId: ids.course,
  instructorId: ids.anucha,
  roomId: ids.room301,
  dayOfWeek: 1,
  startDate: "2026-08-10",
  endDate: "2026-11-27",
  startTime,
  endTime,
  studentCount: 28,
});

describe("auth", () => {
  it("returns user:null for an unauthenticated /auth/me (public bootstrap)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/auth/me" });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toBeNull();
  });

  it("rejects a mutation without the CSRF header", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/bookings/check-conflicts",
      headers: { cookie: staffA },
      payload: draft("09:00", "10:00"),
    });
    expect(res.statusCode).toBe(403);
  });

  it("requires a session for staff-only endpoints", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/bookings" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHENTICATED");
  });
});

describe("conflict detection", () => {
  it("flags a blocking conflict against an approved booking and suggests alternatives", async () => {
    // Seeded: CEDT101 approved in E12-301, Mondays 10:00-12:00.
    const res = await post("/api/v1/bookings/check-conflicts", staffA, draft("11:00", "13:00"));
    const body = res.json();

    expect(body.hasBlockingConflicts).toBe(true);
    expect(body.conflicts[0].existing.courseCode).toBe("CEDT101");
    expect(body.alternativeRooms.length).toBeGreaterThan(0);
    // BR-10: every suggestion must be big enough for the class.
    for (const alt of body.alternativeRooms) expect(alt.capacity).toBeGreaterThanOrEqual(28);
  });

  it("treats back-to-back bookings as non-conflicting (half-open intervals, BR-2)", async () => {
    const res = await post("/api/v1/bookings/check-conflicts", staffA, draft("12:00", "13:00"));
    expect(res.json().hasBlockingConflicts).toBe(false);
  });

  it("reports a capacity warning without blocking (BR-9)", async () => {
    const res = await post("/api/v1/bookings/check-conflicts", staffA, {
      ...draft("12:00", "13:00"),
      studentCount: 55, // E12-301 holds 40
    });
    const body = res.json();
    expect(body.capacityWarning).toEqual({ roomCapacity: 40, studentCount: 55 });
    expect(body.hasBlockingConflicts).toBe(false);
  });
});

describe("booking lifecycle — staff auto-approve + first approval wins (BR-8)", () => {
  it("auto-approves a staff submission, blocks the slot, then frees it on cancel", async () => {
    // A free Monday slot in E12-301 → created AND approved in one step, and now blocking.
    const bk1 = (await post("/api/v1/bookings", staffA, draft("16:00", "17:00"))).json().booking;
    expect(bk1.status).toBe("approved");
    expect(bk1.requestNo).toMatch(/^LS-\d{4}-\d{5}$/);
    // Mondays from 2026-08-10 to 2026-11-27 inclusive.
    expect(bk1.occurrenceCount).toBe(16);

    // BR-6: a second submission overlapping the now-approved slot is refused at submit time.
    const overlap = await post("/api/v1/bookings", staffA, draft("16:30", "17:30"));
    expect(overlap.statusCode).toBe(409);
    expect(overlap.json().error.code).toBe("CONFLICT");

    // Cancelling the approved booking frees the slot again.
    const cancelled = await post(`/api/v1/bookings/${bk1.id}/cancel`, staffA, {
      reason: "No longer needed",
    });
    expect(cancelled.json().booking.status).toBe("cancelled");

    const nowFree = await post("/api/v1/bookings/check-conflicts", staffA, draft("16:00", "17:00"));
    expect(nowFree.json().hasBlockingConflicts).toBe(false);
  });

  it("refuses to approve a seeded pending request that clashes with an approved slot, then rejects it (BR-8/BR-11)", async () => {
    // The seed leaves Krit's CEDT101 Sec 2 (E12-301, Mon 10:00-12:00) pending on top of the
    // already-approved CEDT101 Sec 1 — the classic "first approval wins" demo.
    const pending = (await get("/api/v1/bookings?status=pending&pageSize=100", staffB)).json()
      .items as { id: string; courseCode: string; section: string; roomId: string; startTime: string }[];
    const clash = pending.find(
      (b) => b.courseCode === "CEDT101" && b.section === "2" && b.roomId === ids.room301,
    )!;
    expect(clash).toBeTruthy();

    const approve = await post(`/api/v1/bookings/${clash.id}/approve`, staffB);
    expect(approve.statusCode).toBe(409);
    expect(approve.json().error.code).toBe("CONFLICT");
    expect(approve.json().error.details.length).toBeGreaterThan(0);

    // It stays pending after the failed approval.
    const after = (await get(`/api/v1/bookings/${clash.id}`, staffB)).json().booking;
    expect(after.status).toBe("pending");

    // Rejection requires a >= 10 char reason (BR-11).
    const tooShort = await post(`/api/v1/bookings/${clash.id}/reject`, staffB, { reason: "no" });
    expect(tooShort.statusCode).toBe(422);

    const rejected = await post(`/api/v1/bookings/${clash.id}/reject`, staffB, {
      reason: "Slot taken by an earlier approval",
    });
    expect(rejected.json().booking.status).toBe("rejected");

    // Terminal state: no further transitions.
    const again = await post(`/api/v1/bookings/${clash.id}/approve`, staffB);
    expect(again.json().error.code).toBe("INVALID_TRANSITION");
  });

  it("rejects off-grid times and inverted ranges (BR-17)", async () => {
    const res = await post("/api/v1/bookings", staffA, draft("10:17", "09:00"));
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("VALIDATION");
  });
});

describe("public calendar", () => {
  it("shows approved bookings only to anonymous visitors (no session)", async () => {
    const body = (await get("/api/v1/calendar?from=2026-08-17&to=2026-08-23")).json();

    expect(body.occurrences.length).toBeGreaterThan(0);
    for (const o of body.occurrences) {
      expect(o.status).toBe("approved");
      expect(o.isTentativeAnonymous).toBe(false);
      // Approved bookings are fully described — the public view is not anonymized.
      expect(o.instructorName).toBeTruthy();
    }
  });

  it("additionally shows pending bookings to logged-in staff", async () => {
    const body = (await get("/api/v1/calendar?from=2026-08-17&to=2026-08-23", staffA)).json();
    expect(body.occurrences.some((o: { status: string }) => o.status === "pending")).toBe(true);
  });
});

describe("master data", () => {
  it("409s on a duplicate course code", async () => {
    const res = await post("/api/v1/courses", staffB, { code: "CEDT101", name: "Dupe" });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("DUPLICATE");
  });

  it("warns before deactivating a room with future approved bookings (BR-14)", async () => {
    const rooms = (await get("/api/v1/rooms", staffB)).json() as {
      items: { id: string; name: string }[];
    };
    const room = rooms.items.find((r) => r.name === "E12-301")!;

    const warn = await app.inject({
      method: "PATCH",
      url: `/api/v1/rooms/${room.id}`,
      headers: { cookie: staffB, "x-requested-with": "XMLHttpRequest" },
      payload: { isActive: false },
    });
    expect(warn.statusCode).toBe(409);
    expect(warn.json().error.code).toBe("NEEDS_CONFIRM");
    expect(warn.json().error.details.length).toBeGreaterThan(0);

    const confirmed = await app.inject({
      method: "PATCH",
      url: `/api/v1/rooms/${room.id}`,
      headers: { cookie: staffB, "x-requested-with": "XMLHttpRequest" },
      payload: { isActive: false, confirm: true },
    });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json().room.isActive).toBe(false);

    // Put it back so the seed state stays usable.
    await app.inject({
      method: "PATCH",
      url: `/api/v1/rooms/${room.id}`,
      headers: { cookie: staffB, "x-requested-with": "XMLHttpRequest" },
      payload: { isActive: true },
    });
  });
});
