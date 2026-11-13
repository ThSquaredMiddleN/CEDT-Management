import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import type { getSettings } from "../src/modules/course-change/settings.js";

let app: FastifyInstance;
let staff: string;
let student: string;
let initial: Awaited<ReturnType<typeof getSettings>>;
const reason = "settings integration regression";

async function login(email: string, password: string) {
  const res = await app.inject({ method: "POST", url: "/api/v1/auth/login", headers: { "x-requested-with": "XMLHttpRequest" }, payload: { email, password } });
  expect(res.statusCode).toBe(200);
  return `labsync_session=${res.cookies.find((c) => c.name === "labsync_session")!.value}`;
}
const get = (cookie = staff) => app.inject({ method: "GET", url: "/api/v1/course-change/settings", headers: { cookie } });
const post = (body: unknown, cookie = staff) => app.inject({ method: "POST", url: "/api/v1/course-change/settings",
  headers: { cookie, "x-requested-with": "XMLHttpRequest" }, payload: body ?? {} });
const input = (data: typeof initial) => ({ termId: data.term.id, revision: data.revision, windows: data.windows,
  courses: data.courses.map(({ courseId, allowDrop, allowWithdraw, note }) => ({ courseId, allowDrop, allowWithdraw, note })), reason });

beforeAll(async () => {
  app = await buildApp();
  staff = await login("admin@cedt.edu", "admin1234");
  student = await login("student3@cedt.edu", "student1234");
  initial = (await get()).json();
});
afterAll(async () => {
  if (initial?.term) {
    const current = (await get()).json();
    if (current.revision !== initial.revision) await post({ ...input(initial), revision: current.revision });
    await prisma.courseChangeSettingsEvent.deleteMany({ where: { reason, termId: initial.term.id } });
  }
  await app?.close();
  await prisma.$disconnect();
});

describe("Course Change settings", () => {
  it("only exposes settings to staff", async () => {
    expect((await get()).statusCode).toBe(200);
    expect(initial.windows).toHaveLength(5);
    expect(initial.courses.length).toBeGreaterThan(0);
    expect((await get(student)).statusCode).toBe(403);
    expect((await post(input(initial), student)).statusCode).toBe(403);
  });

  it("rejects overlapping windows and does not change policy", async () => {
    const body = input(initial);
    body.windows = [...body.windows, body.windows[0]!];
    expect((await post(body)).statusCode).toBe(422);
    expect((await get()).json().revision).toBe(initial.revision);
  });

  it("rejects inverted ranges, unknown courses, and missing audit reasons", async () => {
    const body = input(initial);
    expect((await post({ ...body, windows: [{ ...body.windows[0], weekFrom: 10, weekTo: 2 }] })).statusCode).toBe(422);
    expect((await post({ ...body, courses: body.courses.slice(1) })).statusCode).toBe(422);
    expect((await post({ ...body, reason: "" })).statusCode).toBe(422);
  });

  it("saves announcements with before/after audit and rejects stale edits", async () => {
    const body = input(initial);
    body.courses = body.courses.map((c, i) => i === 0 ? { ...c, allowDrop: !c.allowDrop, note: "review announcement" } : c);
    const response = await post(body);
    expect(response.statusCode).toBe(200);
    const saved = response.json();
    expect(saved.revision).not.toBe(initial.revision);
    expect(saved.courses[0].note).toBe("review announcement");
    expect(saved.history[0].reason).toBe(reason);
    const event = await prisma.courseChangeSettingsEvent.findFirstOrThrow({ where: { reason }, orderBy: { id: "desc" } });
    expect((event.before as { courses: { allowDrop: boolean }[] }).courses[0]!.allowDrop).toBe(initial.courses[0]!.allowDrop);
    expect((event.after as { courses: { allowDrop: boolean }[] }).courses[0]!.allowDrop).toBe(!initial.courses[0]!.allowDrop);
    expect((await post(body)).statusCode).toBe(409);
  });

  it("applies changed windows to new routing while preserving existing request flows", async () => {
    const current = (await get()).json();
    const body = input(current);
    body.windows = body.windows.map((w) => w.requestType === "withdraw" && w.weekFrom === 7 ? { ...w, flow: "reg_direct" } : w);
    const existing = await prisma.courseChangeRequest.findFirstOrThrow({ where: { flow: "advisor_pi" } });
    expect((await post(body)).statusCode).toBe(200);
    const context = await app.inject({ method: "GET", url: "/api/v1/course-change/context", headers: { cookie: staff } });
    expect(context.json().open.withdraw.flow).toBe("reg_direct");
    expect((await prisma.courseChangeRequest.findUniqueOrThrow({ where: { id: existing.id } })).flow).toBe("advisor_pi");
  });
});
