import { readFileSync } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { config } from "../../src/config.js";
import { prisma } from "../../src/db.js";
import { currentTerm } from "../../src/modules/receipts/service.js";
import {
  MADE_UP_NAME,
  sidecarOk,
  sidecarUnreadable,
  startFakeSidecar,
  TINY_JPEG,
  type FakeSidecar,
  type SidecarCheckRow,
} from "./fake-sidecar.js";

/**
 * Receipt checks against a fake OCR sidecar (no Python). All students, references and terms are made up.
 * Every row this file creates is deleted before and after the run, so the suite can rerun.
 */

const TERM = "2/2599"; // made-up terms, so no real rows share them
const TERM_B = "3/2599";
const TERM_RACE = "1/2599"; // two concurrent checks, same reference
const S_A = "6500000001";
const S_B = "6500000002";
const S_C = "6500000003";
const S_D = "6500000004"; // default-term test
const S_E = "6500000005"; // list filters
const S_F = "6500000006"; // list filters (warn)
const S_G = "6500000007"; // delete
const S_H = "6500000008"; // sidecar errors
const S_OWN = "6800000001"; // the seeded student@test.local account's student number
const S_OWN2 = "6800000002"; // the seeded student2@test.local account's student number
const S_I = "6500000009"; // stored files and settling
const S_J = "6500000010"; // stored files and settling
const S_K = "6500000011"; // stored files and settling
const TEST_STUDENTS = [S_A, S_B, S_C, S_D, S_E, S_F, S_G, S_H, S_I, S_J, S_K, S_OWN, S_OWN2];

const BOUNDARY = "----receipt-test-boundary";
const PDF_BYTES = Buffer.from("%PDF-1.4 made-up test bytes, not a real receipt");
const PNG_BYTES = Buffer.from("89504e470d0a1a0a made-up test bytes", "utf8");

function formBody(
  fields: Record<string, string>,
  file?: { type: string; data: Buffer },
): { payload: Buffer; contentType: string } {
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`),
    );
  }
  if (file) {
    chunks.push(
      Buffer.from(
        `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="upload.bin"\r\nContent-Type: ${file.type}\r\n\r\n`,
      ),
      file.data,
      Buffer.from("\r\n"),
    );
  }
  chunks.push(Buffer.from(`--${BOUNDARY}--\r\n`));
  return { payload: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${BOUNDARY}` };
}

let app: FastifyInstance;
let fake: FakeSidecar;
let cookie: string;
let adminId: string;
const originalUrl = config.OCR_SERVICE_URL;
const originalTimeout = config.OCR_TIMEOUT_MS;

async function login(email: string, password: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: { "x-requested-with": "XMLHttpRequest" },
    payload: { email, password },
  });
  expect(res.statusCode).toBe(200);
  const c = res.cookies.find((x) => x.name === "labsync_session");
  return `labsync_session=${c!.value}`;
}

async function cleanup(): Promise<void> {
  const rows = await prisma.receiptCheck.findMany({
    where: { studentId: { in: TEST_STUDENTS } },
    select: { fileId: true },
  });
  await prisma.receiptCheck.deleteMany({ where: { studentId: { in: TEST_STUDENTS } } });
  await prisma.file.deleteMany({ where: { id: { in: rows.flatMap((r) => (r.fileId ? [r.fileId] : [])) } } });
}

beforeAll(async () => {
  fake = await startFakeSidecar();
  config.OCR_SERVICE_URL = fake.url;
  app = await buildApp();
  await app.ready();
  cookie = await login("admin@cedt.edu", "admin1234");
  adminId = (await prisma.user.findUniqueOrThrow({ where: { email: "admin@cedt.edu" } })).id;
  await cleanup();
});

beforeEach(() => {
  fake.reply = (call) => sidecarOk(call);
});

afterAll(async () => {
  await cleanup();
  config.OCR_SERVICE_URL = originalUrl;
  config.OCR_TIMEOUT_MS = originalTimeout;
  await app.close();
  await fake.close();
  await prisma.$disconnect();
});

const upload = (fields: Record<string, string>, file?: { type: string; data: Buffer }, withCookie = true) => {
  const body = formBody(fields, file);
  return app.inject({
    method: "POST",
    url: "/api/v1/receipts/check",
    headers: {
      ...(withCookie ? { cookie } : {}),
      "x-requested-with": "XMLHttpRequest",
      "content-type": body.contentType,
    },
    payload: body.payload,
  });
};

const pdf = (fields: Record<string, string>) => upload(fields, { type: "application/pdf", data: PDF_BYTES });

const listRows = (query = "") =>
  app.inject({ method: "GET", url: `/api/v1/receipts${query}`, headers: { cookie } });

/** The whole row as JSON, as Postgres sees it (every column, not just the ones the API returns). */
async function rawRowJson(studentId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ j: string }[]>`
    SELECT row_to_json(r)::text AS j FROM receipt_checks r WHERE r.student_id = ${studentId}`;
  return rows.map((r) => r.j);
}

describe("auth", () => {
  it("rejects unauthenticated calls with 401", async () => {
    const res = await upload({ studentId: S_A }, { type: "application/pdf", data: PDF_BYTES }, false);
    expect(res.statusCode).toBe(401);
    const list = await app.inject({ method: "GET", url: "/api/v1/receipts" });
    expect(list.statusCode).toBe(401);
    const del = await app.inject({
      method: "DELETE",
      url: "/api/v1/receipts/00000000-0000-4000-8000-000000000000",
      headers: { "x-requested-with": "XMLHttpRequest" },
    });
    expect(del.statusCode).toBe(401);
  });
});

describe("POST /receipts/check validation", () => {
  it("rejects a studentId that is not exactly 10 digits with 400", async () => {
    const before = fake.calls.length;
    for (const bad of ["650000001", "65000000012", "65000000AB", "6500 00001"]) {
      const res = await pdf({ studentId: bad });
      expect(res.statusCode, bad).toBe(400);
      expect(res.body).not.toContain(bad);
    }
    expect(fake.calls.length).toBe(before);
  });

  it("rejects a bad term with 400", async () => {
    for (const bad of ["4/2569", "1/25", "1/2469", "1-2569"]) {
      const res = await pdf({ studentId: S_A, term: bad });
      expect(res.statusCode, bad).toBe(400);
    }
  });

  it("rejects a file that is not PDF, JPEG or PNG with 415", async () => {
    const before = fake.calls.length;
    const res = await upload({ studentId: S_A }, { type: "text/plain", data: Buffer.from("hello") });
    expect(res.statusCode).toBe(415);
    expect(fake.calls.length).toBe(before);
  });

  it("rejects a file over 10 MB with 413", async () => {
    const before = fake.calls.length;
    const big = Buffer.alloc(10 * 1024 * 1024 + 1, 0x41);
    const res = await upload({ studentId: S_A }, { type: "application/pdf", data: big });
    expect(res.statusCode).toBe(413);
    expect(fake.calls.length).toBe(before);
  });

  it("requires a file field with 400", async () => {
    const res = await upload({ studentId: S_A });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /receipts/check", () => {
  it("forwards the file and stores the check fields, not the file or the name", async () => {
    const res = await pdf({ studentId: S_A, term: TERM });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      check: { studentId: string; term: string; kind: string; reference: string; amount: string; verdict: string; checkedById: string };
      fields: { name: { value: string } };
    };

    // Forwarded: term and student ID as query params, the same bytes, the right content type.
    const call = fake.calls[fake.calls.length - 1]!;
    expect(call.term).toBe(TERM);
    expect(call.studentId).toBe(S_A);
    expect(call.contentType).toBe("application/pdf");
    expect(call.bytes.equals(PDF_BYTES)).toBe(true);

    // Response: the row, and the sidecar fields (name included) for display.
    expect(body.check).toMatchObject({
      studentId: S_A,
      term: TERM,
      kind: "pdf",
      reference: "RC-TEST-0001",
      amount: "1,500.00",
      verdict: "ok",
      checkedById: adminId,
    });
    expect(body.fields.name.value).toBe(MADE_UP_NAME);

    // Stored row: expected columns, and no name anywhere in the raw row.
    const row = await prisma.receiptCheck.findUniqueOrThrow({
      where: { studentId_term: { studentId: S_A, term: TERM } },
    });
    expect(row).toMatchObject({
      kind: "pdf",
      reference: "RC-TEST-0001",
      amount: "1,500.00",
      paymentStatus: null,
      paidAt: "1 ก.ค. 2599 10:00",
      funding: null,
      verdict: "ok",
      checkedById: adminId,
    });
    expect(Array.isArray(row.checks)).toBe(true);
    const raw = await rawRowJson(S_A);
    expect(raw.length).toBe(1);
    expect(raw[0]).not.toContain("ทดสอบ");
    expect(JSON.stringify(row)).not.toContain("ทดสอบ");
  });

  it("stores screenshot fields under the screenshot names", async () => {
    fake.reply = (call) => sidecarOk(call, { kind: "screenshot", reference: "RC-SHOT-0001" });
    const res = await upload({ studentId: S_C, term: TERM }, { type: "image/png", data: PNG_BYTES });
    expect(res.statusCode).toBe(200);
    expect(fake.calls[fake.calls.length - 1]!.contentType).toBe("image/png");
    const row = await prisma.receiptCheck.findUniqueOrThrow({
      where: { studentId_term: { studentId: S_C, term: TERM } },
    });
    expect(row).toMatchObject({ kind: "screenshot", reference: "RC-SHOT-0001", paymentStatus: "ชำระเงินสำเร็จ" });
  });

  it("uses the current term when none is given", async () => {
    const res = await pdf({ studentId: S_D });
    expect(res.statusCode).toBe(200);
    const term = currentTerm();
    expect(fake.calls[fake.calls.length - 1]!.term).toBe(term);
    const row = await prisma.receiptCheck.findUniqueOrThrow({
      where: { studentId_term: { studentId: S_D, term } },
    });
    expect(row.term).toBe(term);
  });

  it("replaces the earlier row on a re-check of the same student and term", async () => {
    fake.reply = (call) => sidecarOk(call, { reference: "RC-A-1" });
    expect((await pdf({ studentId: S_B, term: TERM })).statusCode).toBe(200);
    const first = await prisma.receiptCheck.findUniqueOrThrow({
      where: { studentId_term: { studentId: S_B, term: TERM } },
    });

    fake.reply = (call) => sidecarOk(call, { reference: "RC-A-2" });
    expect((await pdf({ studentId: S_B, term: TERM })).statusCode).toBe(200);

    const rows = await prisma.receiptCheck.findMany({ where: { studentId: S_B } });
    expect(rows.length).toBe(1);
    expect(rows[0]!.reference).toBe("RC-A-2");
    expect(rows[0]!.id).toBe(first.id);
  });

  it("flags a reference already used by another student in the same term as fail", async () => {
    fake.reply = (call) => sidecarOk(call, { reference: "RC-DUP-1" });
    const first = await pdf({ studentId: S_A, term: TERM_B });
    expect((first.json() as { check: { verdict: string } }).check.verdict).toBe("ok");

    const second = await pdf({ studentId: S_E, term: TERM_B });
    expect(second.statusCode).toBe(200);
    const check = (second.json() as { check: { verdict: string; checks: SidecarCheckRow[] } }).check;
    expect(check.verdict).toBe("fail");
    const dup = check.checks.find((c) => c.name === "Not submitted before");
    expect(dup).toEqual({
      name: "Not submitted before",
      state: "fail",
      detail: `reference already used for student ${S_A}, term ${TERM_B}`,
    });
    // The earlier student's row is untouched.
    const other = await prisma.receiptCheck.findUniqueOrThrow({
      where: { studentId_term: { studentId: S_A, term: TERM_B } },
    });
    expect(other.verdict).toBe("ok");
  });

  it("lets only one of two concurrent checks with the same reference pass the duplicate check", async () => {
    fake.reply = (call) => sidecarOk(call, { reference: "RC-RACE-1" });
    const where = { studentId: { in: [S_B, S_C] }, term: TERM_RACE };
    // A SHARE lock blocks writes to receipt_checks but not reads. Both checks read the table (no duplicate yet),
    // then wait to save; the lock is released only after both have read. The fix takes an advisory lock first, so
    // the second check waits there and reads the first one's row.
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let markLocked!: () => void;
    const locked = new Promise<void>((resolve) => (markLocked = resolve));
    const holder = prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`LOCK TABLE receipt_checks IN SHARE MODE`;
        markLocked();
        await released;
      },
      { timeout: 15_000 },
    );
    try {
      await locked;
      const before = fake.calls.length;
      const requests = Promise.all([
        pdf({ studentId: S_B, term: TERM_RACE }),
        pdf({ studentId: S_C, term: TERM_RACE }),
      ]);
      for (let i = 0; i < 500 && fake.calls.length < before + 2; i++) {
        await new Promise((r) => setTimeout(r, 10));
      }
      await new Promise((r) => setTimeout(r, 300)); // both checks have read the table by now
      release();
      const [a, b] = await requests;
      expect(a.statusCode).toBe(200);
      expect(b.statusCode).toBe(200);
      const rows = await prisma.receiptCheck.findMany({ where });
      expect(rows).toHaveLength(2);
      const failed = rows.filter((r) =>
        (r.checks as unknown as SidecarCheckRow[]).some((c) => c.name === "Not submitted before" && c.state === "fail"),
      );
      expect(failed).toHaveLength(1);
    } finally {
      release();
      await holder;
      await prisma.receiptCheck.deleteMany({ where });
    }
  });

  it("answers warn when the worst check is warn", async () => {
    fake.reply = (call) =>
      sidecarOk(call, {
        kind: "screenshot",
        reference: "RC-WARN-1",
        checks: [
          { name: "Belongs to this student", state: "warn", detail: "only the first 4 digits are shown" },
          { name: "Payment completed", state: "ok", detail: "ok" },
        ],
      });
    const res = await upload({ studentId: S_F, term: TERM }, { type: "image/jpeg", data: PNG_BYTES });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { check: { verdict: string } }).check.verdict).toBe("warn");
  });

  it("returns 503 when the sidecar answers 503", async () => {
    fake.reply = () => ({ status: 503, body: { error: "OCR engine unavailable" } });
    const res = await pdf({ studentId: S_H, term: TERM });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toMatchObject({ code: "SERVICE_UNAVAILABLE", message: "OCR service unavailable" });
    expect(await prisma.receiptCheck.count({ where: { studentId: S_H } })).toBe(0);
  });

  it("returns 503 when the sidecar is down (closed port)", async () => {
    const probe = net.createServer();
    await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
    const port = (probe.address() as net.AddressInfo).port;
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    config.OCR_SERVICE_URL = `http://127.0.0.1:${port}`;
    try {
      const res = await pdf({ studentId: S_H, term: TERM });
      expect(res.statusCode).toBe(503);
      expect(res.json().error).toMatchObject({ code: "SERVICE_UNAVAILABLE", message: "OCR service unavailable" });
    } finally {
      config.OCR_SERVICE_URL = fake.url;
    }
  });

  it("answers 422 with a plain message when the sidecar cannot read the image", async () => {
    fake.reply = () => sidecarUnreadable();
    const res = await upload({ studentId: S_H, term: TERM }, { type: "image/png", data: PNG_BYTES });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatchObject({
      code: "VALIDATION",
      message: "Could not read this receipt. Try a clearer screenshot or the PDF.",
    });
    expect(await prisma.receiptCheck.count({ where: { studentId: S_H } })).toBe(0);
  });

  it("returns 504 when the sidecar is slower than OCR_TIMEOUT_MS", async () => {
    fake.reply = (call) => ({ ...sidecarOk(call), delayMs: 1_500 });
    config.OCR_TIMEOUT_MS = 200;
    try {
      const res = await pdf({ studentId: S_H, term: TERM });
      expect(res.statusCode).toBe(504);
    } finally {
      config.OCR_TIMEOUT_MS = originalTimeout;
    }
  });

  it("passes a sidecar 415 through as 415", async () => {
    fake.reply = () => ({ status: 415, body: { error: "PDF, JPEG or PNG only" } });
    const res = await pdf({ studentId: S_H, term: TERM });
    expect(res.statusCode).toBe(415);
  });
});

describe("GET /receipts", () => {
  beforeAll(async () => {
    // Rows for the filter tests: S_E ok and S_F warn, both in TERM_B.
    fake.reply = (call) => sidecarOk(call, { reference: `RC-LIST-${call.studentId}` });
    expect((await pdf({ studentId: S_E, term: TERM_B })).statusCode).toBe(200);
    fake.reply = (call) =>
      sidecarOk(call, {
        reference: `RC-LIST-${call.studentId}`,
        checks: [{ name: "Belongs to this student", state: "warn", detail: "prefix only" }],
      });
    expect((await pdf({ studentId: S_F, term: TERM_B })).statusCode).toBe(200);
  });

  it("lists rows newest first; the OCR'd name is on the warn row only", async () => {
    const res = await listRows(`?term=${encodeURIComponent(TERM_B)}`);
    expect(res.statusCode).toBe(200);
    const items = (res.json() as { items: { studentId: string; term: string }[] }).items;
    const mine = items.filter((i) => i.studentId === S_E || i.studentId === S_F);
    expect(mine.map((i) => i.studentId)).toEqual([S_F, S_E]);
    expect(items.every((i) => i.term === TERM_B)).toBe(true);
    const names = (res.json() as { items: { studentId: string; ocrName: string | null }[] }).items;
    expect(names.find((i) => i.studentId === S_F)!.ocrName).toBe(MADE_UP_NAME);
    expect(names.find((i) => i.studentId === S_E)!.ocrName).toBeNull();
  });

  it("filters by verdict", async () => {
    const res = await listRows("?verdict=warn");
    const items = (res.json() as { items: { studentId: string; verdict: string }[] }).items;
    expect(items.every((i) => i.verdict === "warn")).toBe(true);
    expect(items.some((i) => i.studentId === S_F)).toBe(true);
    expect(items.some((i) => i.studentId === S_E)).toBe(false);
  });

  it("rejects a bad filter with 400", async () => {
    expect((await listRows("?term=bad")).statusCode).toBe(400);
    expect((await listRows("?verdict=maybe")).statusCode).toBe(400);
  });
});

describe("DELETE /receipts/:id", () => {
  it("deletes a row (204), then 404 for the same id, and 400 for a bad id", async () => {
    fake.reply = (call) => sidecarOk(call, { reference: "RC-DEL-1" });
    expect((await pdf({ studentId: S_G, term: TERM })).statusCode).toBe(200);
    const row = await prisma.receiptCheck.findUniqueOrThrow({
      where: { studentId_term: { studentId: S_G, term: TERM } },
    });

    const del = await app.inject({
      method: "DELETE",
      url: `/api/v1/receipts/${row.id}`,
      headers: { cookie, "x-requested-with": "XMLHttpRequest" },
    });
    expect(del.statusCode).toBe(204);
    expect(await prisma.receiptCheck.count({ where: { id: row.id } })).toBe(0);

    const again = await app.inject({
      method: "DELETE",
      url: `/api/v1/receipts/${row.id}`,
      headers: { cookie, "x-requested-with": "XMLHttpRequest" },
    });
    expect(again.statusCode).toBe(404);

    const bad = await app.inject({
      method: "DELETE",
      url: "/api/v1/receipts/not-a-uuid",
      headers: { cookie, "x-requested-with": "XMLHttpRequest" },
    });
    expect(bad.statusCode).toBe(400);
  });
});

describe("student receipts (POST and GET /receipts/mine)", () => {
  const TERM_OLD = "3/2598"; // made-up term for an older row
  let studentCookie: string;
  let student2Cookie: string;
  let staffCookie: string;
  let noRoleCookie: string;
  let studentUserId: string;
  let staffUserId: string;

  const submitMine = (c: string, fields: Record<string, string>, reference?: string) => {
    if (reference) fake.reply = (call) => sidecarOk(call, { reference });
    const body = formBody(fields, { type: "application/pdf", data: PDF_BYTES });
    return app.inject({
      method: "POST",
      url: "/api/v1/receipts/mine",
      headers: { cookie: c, "x-requested-with": "XMLHttpRequest", "content-type": body.contentType },
      payload: body.payload,
    });
  };
  const listMine = (c: string) => app.inject({ method: "GET", url: "/api/v1/receipts/mine", headers: { cookie: c } });

  beforeAll(async () => {
    studentCookie = await login("student@test.local", "test1234");
    student2Cookie = await login("student2@test.local", "test1234");
    staffCookie = await login("staff@test.local", "test1234");
    noRoleCookie = await login("norole@test.local", "test1234");
    studentUserId = (await prisma.user.findUniqueOrThrow({ where: { email: "student@test.local" } })).id;
    staffUserId = (await prisma.user.findUniqueOrThrow({ where: { email: "staff@test.local" } })).id;
    await prisma.receiptCheck.deleteMany({ where: { studentId: { in: TEST_STUDENTS } } });
  });
  // Each case starts with no row for the student, so a passed row from one case can't lock the next.
  beforeEach(async () => {
    await prisma.receiptCheck.deleteMany({ where: { studentId: { in: [S_OWN, S_OWN2] } } });
  });
  const warnChecks: SidecarCheckRow[] = [{ name: "Belongs to this student", state: "warn", detail: "prefix only" }];

  it("saves the row under the student's own number, ignoring a studentId or term sent in the form", async () => {
    const before = fake.calls.length;
    const res = await submitMine(studentCookie, { studentId: S_A, term: TERM_OLD });
    expect(res.statusCode).toBe(200);
    expect(fake.calls.length).toBe(before + 1);
    const call = fake.calls[fake.calls.length - 1]!;
    expect(call.studentId).toBe(S_OWN);
    expect(call.term).toBe(currentTerm());

    const row = await prisma.receiptCheck.findUniqueOrThrow({
      where: { studentId_term: { studentId: S_OWN, term: currentTerm() } },
    });
    expect(row.checkedById).toBe(studentUserId);
    expect(await prisma.receiptCheck.count({ where: { studentId: S_A, checkedById: studentUserId } })).toBe(0);
  });

  it("answers with the safe shape only: no fields, name, reference, reviewer or other student's ID", async () => {
    // Another student's row already holds the reference the student is about to submit.
    fake.reply = (call) => sidecarOk(call, { reference: "RC-MINE-DUP" });
    expect((await pdf({ studentId: S_B, term: TERM_OLD })).statusCode).toBe(200);

    const res = await submitMine(studentCookie, {}, "RC-MINE-DUP");
    expect(res.statusCode).toBe(200);
    const body = res.json() as { check: Record<string, unknown>; fields?: unknown };
    expect(Object.keys(body)).toEqual(["check"]);
    expect(Object.keys(body.check).sort()).toEqual(["checks", "createdAt", "id", "kind", "settleNote", "settlement", "staffChecked", "term", "verdict"]);
    expect(body.check).toMatchObject({ term: currentTerm(), kind: "pdf", verdict: "fail" });
    expect(body.check.checks).toContainEqual({ name: "Not submitted before", state: "fail" });
    expect(res.body).not.toContain(S_B);
    expect(res.body).not.toContain("RC-MINE-DUP");
    expect(res.body).not.toContain(MADE_UP_NAME);
    expect(res.body).not.toContain(adminId);
    expect(res.body).not.toContain(studentUserId);
    expect(res.body).not.toContain("detail");
  });

  it("does not let someone else's receipt claim its reference, so the owner can still submit it", async () => {
    fake.reply = (call) =>
      sidecarOk(call, {
        reference: "RC-NOT-MINE",
        checks: [
          { name: "Belongs to this student", state: "fail", detail: "ID does not match" },
          { name: "Not submitted before", state: "ok", detail: "reference not seen before (this session)" },
        ],
      });
    const res = await submitMine(studentCookie, {});
    expect(res.statusCode).toBe(200);
    const row = await prisma.receiptCheck.findUniqueOrThrow({
      where: { studentId_term: { studentId: S_OWN, term: currentTerm() } },
    });
    expect(row.verdict).toBe("fail");
    expect(row.reference).toBeNull();

    // The real owner's receipt, checked afterwards, passes the duplicate check.
    fake.reply = (call) => sidecarOk(call, { reference: "RC-NOT-MINE" });
    const owner = await pdf({ studentId: S_C, term: currentTerm() });
    const dup = (owner.json() as { check: { checks: SidecarCheckRow[] } }).check.checks.find(
      (c) => c.name === "Not submitted before",
    );
    expect(dup?.state).toBe("ok");
  });

  describe("duplicate check against an unsettled row", () => {
    const dupOf = (res: { json: () => unknown }) =>
      (res.json() as { check: { verdict: string; checks: { name: string; state: string }[] } }).check;

    it("is only a warn when the other row is an unchecked student upload; both rows keep the reference", async () => {
      // B (a student whose ID matches the visible prefix) uploads A's screenshot first: warn, unsettled.
      fake.reply = (call) => sidecarOk(call, { reference: "RC-UNSETTLED-1", checks: warnChecks });
      expect((await submitMine(student2Cookie, {})).json()).toMatchObject({ check: { verdict: "warn" } });

      // A's genuine upload: warn, not fail, and not ok.
      fake.reply = (call) => sidecarOk(call, { reference: "RC-UNSETTLED-1" });
      const a = await submitMine(studentCookie, {});
      expect(a.statusCode).toBe(200);
      const check = dupOf(a);
      expect(check.verdict).toBe("warn");
      expect(check.checks).toContainEqual({ name: "Not submitted before", state: "warn" });
      // Student-facing view: no other student's ID, reference or detail text.
      expect(a.body).not.toContain(S_OWN2);
      expect(a.body).not.toContain("RC-UNSETTLED-1");
      expect(a.body).not.toContain("detail");

      const rowA = await prisma.receiptCheck.findUniqueOrThrow({
        where: { studentId_term: { studentId: S_OWN, term: currentTerm() } },
      });
      expect(rowA.reference).toBe("RC-UNSETTLED-1");
      expect(rowA.checks as unknown as SidecarCheckRow[]).toContainEqual(
        expect.objectContaining({ name: "Not submitted before", state: "warn", detail: expect.stringContaining("staff") }),
      );
      const rowB = await prisma.receiptCheck.findUniqueOrThrow({
        where: { studentId_term: { studentId: S_OWN2, term: currentTerm() } },
      });
      expect(rowB.reference).toBe("RC-UNSETTLED-1");
      expect(rowB.verdict).toBe("warn");
    });

    it("is also a warn for a staff check against an unchecked student upload", async () => {
      fake.reply = (call) => sidecarOk(call, { reference: "RC-UNSETTLED-2", checks: warnChecks });
      expect((await submitMine(student2Cookie, {})).statusCode).toBe(200);
      fake.reply = (call) => sidecarOk(call, { reference: "RC-UNSETTLED-2" });
      const res = await pdf({ studentId: S_A, term: currentTerm() });
      const check = dupOf(res);
      expect(check.verdict).toBe("warn");
      expect(check.checks).toContainEqual(expect.objectContaining({ name: "Not submitted before", state: "warn" }));
      await prisma.receiptCheck.deleteMany({ where: { studentId: S_A, term: currentTerm() } });
    });

    it("is still a fail when the other row passed", async () => {
      expect((await submitMine(studentCookie, {}, "RC-SETTLED-OK")).json()).toMatchObject({ check: { verdict: "ok" } });
      const res = await submitMine(student2Cookie, {}, "RC-SETTLED-OK");
      expect(res.statusCode).toBe(200);
      expect(dupOf(res).verdict).toBe("fail");
      expect(dupOf(res).checks).toContainEqual({ name: "Not submitted before", state: "fail" });
      expect(res.body).not.toContain(S_OWN);
    });

    it("is still a fail when staff checked the other row, even if it only warned", async () => {
      fake.reply = (call) => sidecarOk(call, { reference: "RC-SETTLED-STAFF", checks: warnChecks });
      const staffRes = await pdf({ studentId: S_OWN, term: currentTerm() });
      expect(dupOf(staffRes).verdict).toBe("warn");
      const res = await submitMine(student2Cookie, {}, "RC-SETTLED-STAFF");
      expect(res.statusCode).toBe(200);
      expect(dupOf(res).verdict).toBe("fail");
      expect(dupOf(res).checks).toContainEqual({ name: "Not submitted before", state: "fail" });
    });
  });

  it("replaces the term's row on a re-upload while the student's own check is unsettled", async () => {
    fake.reply = (call) => sidecarOk(call, { reference: "RC-MINE-1", checks: warnChecks });
    const first = (await submitMine(studentCookie, {})).json() as { check: { id: string } };
    expect((await listMine(studentCookie)).json()).toMatchObject({ locked: false });
    const again = await submitMine(studentCookie, {}, "RC-MINE-2");
    expect(again.statusCode).toBe(200);
    const rows = await prisma.receiptCheck.findMany({ where: { studentId: S_OWN } });
    expect(rows.length).toBe(1);
    expect(rows[0]!.reference).toBe("RC-MINE-2");
    expect((again.json() as { check: { id: string } }).check.id).toBe(first.check.id);
  });

  it("refuses a re-upload once the term's receipt passed (409), without calling the OCR service", async () => {
    expect((await submitMine(studentCookie, {}, "RC-MINE-OK")).json()).toMatchObject({ check: { verdict: "ok" } });
    expect((await listMine(studentCookie)).json()).toMatchObject({ locked: true });
    const before = fake.calls.length;
    const res = await submitMine(studentCookie, {}, "RC-MINE-LATER");
    expect(res.statusCode).toBe(409);
    expect(fake.calls.length).toBe(before);
    const row = await prisma.receiptCheck.findUniqueOrThrow({
      where: { studentId_term: { studentId: S_OWN, term: currentTerm() } },
    });
    expect(row.reference).toBe("RC-MINE-OK");
  });

  it("refuses a re-upload once staff checked the term (409), even when it did not pass", async () => {
    fake.reply = (call) => sidecarOk(call, { reference: "RC-MINE-STAFF", checks: warnChecks });
    expect((await pdf({ studentId: S_OWN, term: currentTerm() })).statusCode).toBe(200);
    expect((await listMine(studentCookie)).json()).toMatchObject({
      locked: true,
      items: [{ verdict: "warn", staffChecked: true }],
    });
    const res = await submitMine(studentCookie, {}, "RC-MINE-AFTER-STAFF");
    expect(res.statusCode).toBe(409);
    // Staff can still check again.
    fake.reply = (call) => sidecarOk(call, { reference: "RC-MINE-STAFF-2" });
    expect((await pdf({ studentId: S_OWN, term: currentTerm() })).statusCode).toBe(200);
  });

  it("hides the Funding row from students; staff still see it", async () => {
    fake.reply = (call) =>
      sidecarOk(call, {
        reference: "RC-MINE-LOAN",
        checks: [...warnChecks, { name: "Funding", state: "info", detail: "กยศ. student loan" }],
      });
    const res = await submitMine(studentCookie, {});
    expect(res.statusCode).toBe(200);
    const names = (res.json() as { check: { checks: { name: string }[] } }).check.checks.map((c) => c.name);
    expect(names).not.toContain("Funding");
    expect(res.body).not.toContain("กยศ");
    const listed = await listMine(studentCookie);
    expect(listed.body).not.toContain("Funding");
    const row = await prisma.receiptCheck.findUniqueOrThrow({
      where: { studentId_term: { studentId: S_OWN, term: currentTerm() } },
    });
    expect(row.checks as { name: string }[]).toContainEqual(expect.objectContaining({ name: "Funding" }));
  });

  it("shows a student only the check names on the allowlist", async () => {
    fake.reply = (call) =>
      sidecarOk(call, {
        reference: "RC-MINE-ALLOW",
        checks: [...warnChecks, { name: "X", state: "info", detail: "made-up staff note" }],
      });
    const res = await submitMine(studentCookie, {});
    expect(res.statusCode).toBe(200);
    const names = (res.json() as { check: { checks: { name: string }[] } }).check.checks.map((c) => c.name);
    expect(names).toEqual(["Belongs to this student", "Not submitted before"]); // the second is added from the database
    expect((await listMine(studentCookie)).body).not.toContain('"X"');
  });

  it("answers 409 and keeps the staff row when staff checked the term while the student's OCR call was running", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    fake.reply = (call) => ({ ...sidecarOk(call, { reference: "RC-RACE-STUDENT" }), hold: gate });
    const before = fake.calls.length;
    const studentUpload = submitMine(studentCookie, {});
    for (let i = 0; i < 500 && fake.calls.length < before + 1; i++) await new Promise((r) => setTimeout(r, 10));
    expect(fake.calls.length).toBe(before + 1); // the student's call is now waiting in the OCR stub

    fake.reply = (call) => sidecarOk(call, { reference: "RC-RACE-STAFF" });
    expect((await pdf({ studentId: S_OWN, term: currentTerm() })).statusCode).toBe(200);
    release();

    const res = await studentUpload;
    expect(res.statusCode).toBe(409);
    const row = await prisma.receiptCheck.findUniqueOrThrow({
      where: { studentId_term: { studentId: S_OWN, term: currentTerm() } },
    });
    expect(row.checkedById).toBe(adminId);
    expect(row.reference).toBe("RC-RACE-STAFF");
  });

  it("never answers 500 for two first uploads at once with no reference", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    fake.reply = (call) => ({ ...sidecarOk(call, { reference: null }), hold: gate });
    const before = fake.calls.length;
    const both = Promise.all([submitMine(studentCookie, {}), submitMine(studentCookie, {})]);
    for (let i = 0; i < 500 && fake.calls.length < before + 2; i++) await new Promise((r) => setTimeout(r, 10));
    expect(fake.calls.length).toBe(before + 2); // both are past the early lock check
    release();

    const [a, b] = await both;
    for (const res of [a, b]) expect([200, 409]).toContain(res.statusCode);
    expect([a, b].some((r) => r.statusCode === 200)).toBe(true);
    expect(await prisma.receiptCheck.count({ where: { studentId: S_OWN, term: currentTerm() } })).toBe(1);
  });

  it("requires a file field with 400", async () => {
    const body = formBody({ studentId: S_A });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/receipts/mine",
      headers: { cookie: studentCookie, "x-requested-with": "XMLHttpRequest", "content-type": body.contentType },
      payload: body.payload,
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 503 when the sidecar answers 503", async () => {
    fake.reply = () => ({ status: 503, body: { error: "OCR engine unavailable" } });
    const res = await submitMine(studentCookie, {});
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toMatchObject({ code: "SERVICE_UNAVAILABLE", message: "OCR service unavailable" });
  });

  it("GET lists only the student's own rows, all terms, newest first, with the safe shape", async () => {
    // Another student's row in the same term must not appear; an older row in another term must.
    fake.reply = (call) => sidecarOk(call, { reference: "RC-MINE-OTHER" });
    expect((await pdf({ studentId: S_B, term: currentTerm() })).statusCode).toBe(200);
    const old = await prisma.receiptCheck.create({
      data: {
        studentId: S_OWN,
        term: TERM_OLD,
        kind: "pdf",
        reference: "RC-MINE-OLD",
        checks: [{ name: "Not submitted before", state: "fail", detail: `reference already used for student ${S_A}` }],
        verdict: "fail",
        checkedById: adminId,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    });

    expect((await submitMine(studentCookie, {}, "RC-MINE-NOW")).statusCode).toBe(200);

    const res = await listMine(studentCookie);
    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.json()).sort()).toEqual(["fileDays", "items", "locked"]);
    expect(res.json()).toMatchObject({ fileDays: config.RECEIPT_FILE_DAYS });
    const items = (res.json() as { items: Record<string, unknown>[] }).items;
    expect(items.map((i) => i.term)).toEqual([currentTerm(), TERM_OLD]);
    expect(items[1]!.id).toBe(old.id);
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual(["checks", "createdAt", "id", "kind", "settleNote", "settlement", "staffChecked", "term", "verdict"]);
      for (const c of item.checks as Record<string, unknown>[]) expect(Object.keys(c).sort()).toEqual(["name", "state"]);
    }
    expect(res.body).not.toContain(S_A);
    expect(res.body).not.toContain(S_B);
    expect(res.body).not.toContain("RC-MINE");
    expect(res.body).not.toContain(MADE_UP_NAME);
  });

  it("returns 403 to a staff account with no student number, with or without the permission", async () => {
    const before = fake.calls.length;
    expect((await submitMine(staffCookie, { studentId: S_A })).statusCode).toBe(403);
    expect((await listMine(staffCookie)).statusCode).toBe(403);

    // With receipts.use granted directly, the student-number check is what refuses.
    await prisma.userPermission.create({ data: { userId: staffUserId, permission: "receipts.use", reason: "test" } });
    try {
      const granted = await submitMine(staffCookie, { studentId: S_A });
      expect(granted.statusCode).toBe(403);
      expect(granted.json().error.message).toBe("Only students with a student number can submit a receipt");
      expect((await listMine(staffCookie)).statusCode).toBe(403);
    } finally {
      await prisma.userPermission.deleteMany({ where: { userId: staffUserId, permission: "receipts.use" } });
    }
    expect(fake.calls.length).toBe(before);
  });

  it("returns 403 to a user without receipts.use, and never calls the OCR service", async () => {
    const before = fake.calls.length;
    expect((await submitMine(noRoleCookie, {})).statusCode).toBe(403);
    expect((await listMine(noRoleCookie)).statusCode).toBe(403);
    expect(fake.calls.length).toBe(before);
  });
});

describe("stored copy, settling a warn", () => {
  const warnChecks: SidecarCheckRow[] = [{ name: "Belongs to this student", state: "warn", detail: "prefix only" }];
  const keepAll = config.RECEIPT_KEEP_ALL_FILES;
  let studentCookie: string;
  let noRoleCookie: string;
  let studentUserId: string;
  let noRoleUserId: string;

  type Row = {
    id: string;
    verdict: string;
    hasFile: boolean;
    fileId?: unknown;
    ocrName: string | null;
    settlement: string | null;
    settleNote: string | null;
    settledAt: string | null;
    settledByName: string | null;
    checkedByName: string | null;
  };

  const exists = (storageKey: string) =>
    access(path.resolve(config.FILE_STORAGE_DIR, ...storageKey.split("/"))).then(
      () => true,
      () => false,
    );
  const rowOf = (studentId: string, term = TERM) =>
    prisma.receiptCheck.findUniqueOrThrow({ where: { studentId_term: { studentId, term } } });
  /** A staff upload for a student; `warn` makes the sidecar's checks warn. */
  const staffUpload = async (studentId: string, reference: string, warn: boolean, storedCopy = true) => {
    fake.reply = (call) => sidecarOk(call, { reference, checks: warn ? warnChecks : undefined, storedCopy });
    const res = await pdf({ studentId, term: TERM });
    expect(res.statusCode).toBe(200);
    return rowOf(studentId);
  };
  const hdr = (c: string) => ({ cookie: c, "x-requested-with": "XMLHttpRequest" });
  const settle = (id: string, body: unknown, c = cookie) =>
    app.inject({ method: "POST", url: `/api/v1/receipts/${id}/settle`, headers: hdr(c), payload: body as object });
  const getFile = (id: string, c = cookie) =>
    app.inject({ method: "GET", url: `/api/v1/receipts/${id}/file`, headers: hdr(c) });
  const listMine = (c: string) => app.inject({ method: "GET", url: "/api/v1/receipts/mine", headers: { cookie: c } });
  const submitMine = (reference: string, warn: boolean) => {
    fake.reply = (call) => sidecarOk(call, { reference, checks: warn ? warnChecks : undefined });
    const body = formBody({}, { type: "application/pdf", data: PDF_BYTES });
    return app.inject({
      method: "POST",
      url: "/api/v1/receipts/mine",
      headers: { ...hdr(studentCookie), "content-type": body.contentType },
      payload: body.payload,
    });
  };

  beforeAll(async () => {
    studentCookie = await login("student@test.local", "test1234");
    noRoleCookie = await login("norole@test.local", "test1234");
    studentUserId = (await prisma.user.findUniqueOrThrow({ where: { email: "student@test.local" } })).id;
    noRoleUserId = (await prisma.user.findUniqueOrThrow({ where: { email: "norole@test.local" } })).id;
  });
  beforeEach(async () => {
    config.RECEIPT_KEEP_ALL_FILES = true;
    await cleanup();
  });
  afterAll(() => {
    config.RECEIPT_KEEP_ALL_FILES = keepAll;
  });

  it("a warn upload stores the file (named without the student) and the OCR'd name", async () => {
    const row = await staffUpload(S_I, "RC-FILE-W", true);
    expect(row.verdict).toBe("warn");
    expect(row.ocrName).toBe(MADE_UP_NAME);
    expect(row.fileId).not.toBeNull();
    const file = await prisma.file.findUniqueOrThrow({ where: { id: row.fileId! } });
    expect(file).toMatchObject({ module: "receipts", mime: "image/jpeg", uploadedById: adminId });
    expect(file.originalName).toBe("receipt-2-2599.jpg");
    expect(file.originalName).not.toContain(S_I);
    expect(await exists(file.storageKey)).toBe(true);
  });

  it("an ok upload keeps a file while RECEIPT_KEEP_ALL_FILES is on and none when it is off; never the name", async () => {
    const kept = await staffUpload(S_I, "RC-FILE-OK", false);
    expect(kept.verdict).toBe("ok");
    expect(kept.fileId).not.toBeNull();
    expect(kept.ocrName).toBeNull();

    config.RECEIPT_KEEP_ALL_FILES = false;
    const dropped = await staffUpload(S_J, "RC-FILE-OK-2", false);
    expect(dropped.verdict).toBe("ok");
    expect(dropped.fileId).toBeNull();
    expect(dropped.ocrName).toBeNull();
    // A warn still keeps its file with the switch off.
    const warn = await staffUpload(S_K, "RC-FILE-W-2", true);
    expect(warn.fileId).not.toBeNull();
    expect(warn.ocrName).toBe(MADE_UP_NAME);
  });

  it("stores no file when the sidecar sends no copy (null or the field missing)", async () => {
    expect((await staffUpload(S_I, "RC-FILE-NONE", true, false)).fileId).toBeNull();
    fake.reply = (call) => {
      const r = sidecarOk(call, { reference: "RC-FILE-OLD" });
      delete (r.body as { stored_copy?: unknown }).stored_copy;
      return r;
    };
    expect((await pdf({ studentId: S_J, term: TERM })).statusCode).toBe(200);
    expect((await rowOf(S_J)).fileId).toBeNull();
  });

  it("staff can open the file: JPEG bytes, no-store, audited; students and anonymous cannot", async () => {
    const row = await staffUpload(S_I, "RC-FILE-GET", true);
    const res = await getFile(row.id);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("image/jpeg");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-disposition"]).toBe('inline; filename="receipt.jpg"');
    expect(res.rawPayload.equals(TINY_JPEG)).toBe(true);
    const views = await prisma.auditLog.findMany({ where: { action: "receipts.file.view", subjectId: row.id } });
    expect(views.length).toBe(1);
    expect(views[0]!.actorId).toBe(adminId);

    expect((await getFile(row.id, studentCookie)).statusCode).toBe(403);
    expect((await getFile(row.id, noRoleCookie)).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: `/api/v1/receipts/${row.id}/file` })).statusCode).toBe(401);
    expect((await getFile("00000000-0000-4000-8000-000000000000")).statusCode).toBe(404);
    expect((await getFile("not-a-uuid")).statusCode).toBe(400);
    // A row with no stored copy is a 404 too.
    const none = await staffUpload(S_J, "RC-FILE-GET-2", true, false);
    expect((await getFile(none.id)).statusCode).toBe(404);
  });

  it("the list shows hasFile and names, never the file id; the OCR'd name only to receipts.manage", async () => {
    const row = await staffUpload(S_I, "RC-LIST-FILE", true);
    const admin = (await prisma.user.findUniqueOrThrow({ where: { id: adminId } })).name;

    const res = await listRows(`?term=${encodeURIComponent(TERM)}`);
    const item = (res.json() as { items: (Row & { studentId: string })[] }).items.find((i) => i.studentId === S_I)!;
    expect(item).toMatchObject({ hasFile: true, ocrName: MADE_UP_NAME, checkedByName: admin, settlement: null, settledAt: null, settledByName: null });
    expect("fileId" in item).toBe(false);
    expect(res.body).not.toContain(row.fileId!);

    // A viewer without receipts.manage sees the row but not the name.
    await prisma.userPermission.create({ data: { userId: noRoleUserId, permission: "receipts.view", reason: "test" } });
    try {
      const viewer = await app.inject({
        method: "GET",
        url: `/api/v1/receipts?term=${encodeURIComponent(TERM)}`,
        headers: { cookie: noRoleCookie },
      });
      expect(viewer.statusCode).toBe(200);
      const seen = (viewer.json() as { items: (Row & { studentId: string })[] }).items.find((i) => i.studentId === S_I)!;
      expect(seen.hasFile).toBe(true);
      expect(seen.ocrName).toBeNull();
      expect(viewer.body).not.toContain(MADE_UP_NAME);
    } finally {
      await prisma.userPermission.deleteMany({ where: { userId: noRoleUserId, permission: "receipts.view" } });
    }
  });

  it("settle pass: verdict ok, student locked, file and name gone, audited without the note", async () => {
    // The student's own warn upload, then staff pass it.
    const mine = (await submitMine("RC-SETTLE-PASS", true)).json() as { check: { id: string; verdict: string } };
    expect(mine.check.verdict).toBe("warn");
    const before = await rowOf(S_OWN, currentTerm());
    expect(before.fileId).not.toBeNull();
    const file = await prisma.file.findUniqueOrThrow({ where: { id: before.fileId! } });
    expect(await exists(file.storageKey)).toBe(true);
    expect((await listMine(studentCookie)).json()).toMatchObject({ locked: false });

    const res = await settle(before.id, { decision: "pass", note: "  looks fine, bank slip  " });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { check: Row };
    expect(body.check).toMatchObject({
      id: before.id,
      verdict: "ok",
      settlement: "pass",
      settleNote: "looks fine, bank slip",
      hasFile: false,
      ocrName: null,
    });
    expect(body.check.settledByName).toBe((await prisma.user.findUniqueOrThrow({ where: { id: adminId } })).name);
    expect(body.check.settledAt).not.toBeNull();
    expect("fileId" in body.check).toBe(false);

    const after = await rowOf(S_OWN, currentTerm());
    expect(after).toMatchObject({ verdict: "ok", settlement: "pass", settledById: adminId, fileId: null, ocrName: null });
    expect(await prisma.file.count({ where: { id: before.fileId! } })).toBe(0);
    expect(await exists(file.storageKey)).toBe(false);
    expect((await getFile(before.id)).statusCode).toBe(404);

    const logs = await prisma.auditLog.findMany({ where: { action: "receipts.check.settle", subjectId: before.id } });
    expect(logs.length).toBe(1);
    expect(logs[0]).toMatchObject({
      actorId: adminId,
      subjectType: "receipt_check",
      before: { verdict: "warn" },
      after: { verdict: "ok", settlement: "pass" },
    });
    const logText = JSON.stringify(logs[0], (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    expect(logText).not.toContain("bank slip");
    expect(logText).not.toContain(MADE_UP_NAME);

    // The student is locked and sees no note for a pass.
    const mineList = await listMine(studentCookie);
    expect(mineList.json()).toMatchObject({ locked: true, items: [{ verdict: "ok", settlement: "pass", settleNote: null }] });
    expect(mineList.body).not.toContain("bank slip");
    expect((await submitMine("RC-SETTLE-LATER", false)).statusCode).toBe(409);
  });

  it("settle fail: a note is required; the student sees it, is unlocked and can upload again", async () => {
    const mine = (await submitMine("RC-SETTLE-FAIL", true)).json() as { check: { id: string } };
    const id = mine.check.id;
    const fileId = (await rowOf(S_OWN, currentTerm())).fileId!;

    expect((await settle(id, { decision: "fail" })).statusCode).toBe(400);
    expect((await settle(id, { decision: "fail", note: "   " })).statusCode).toBe(400);
    expect((await settle(id, { decision: "fail", note: "x".repeat(301) })).statusCode).toBe(400);
    expect((await settle(id, { decision: "maybe", note: "x" })).statusCode).toBe(400);
    expect((await rowOf(S_OWN, currentTerm())).verdict).toBe("warn"); // untouched by the refused calls

    const res = await settle(id, { decision: "fail", note: "ใบเสร็จของคนอื่น" });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { check: Row }).check).toMatchObject({ verdict: "fail", settlement: "fail", settleNote: "ใบเสร็จของคนอื่น" });
    expect(await prisma.file.count({ where: { id: fileId } })).toBe(0);

    const list = await listMine(studentCookie);
    expect(list.json()).toMatchObject({
      locked: false,
      items: [{ verdict: "fail", settlement: "fail", settleNote: "ใบเสร็จของคนอื่น" }],
    });
    const again = await submitMine("RC-SETTLE-FAIL-2", false);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ check: { id, verdict: "ok", settlement: null, settleNote: null } });
    const row = await rowOf(S_OWN, currentTerm());
    expect(row).toMatchObject({ settlement: null, settleNote: null, settledById: null, settledAt: null, checkedById: studentUserId });
  });

  it("a pass may have no note, and an unknown id is 404", async () => {
    const row = await staffUpload(S_I, "RC-SETTLE-NONOTE", true);
    const res = await settle(row.id, { decision: "pass" });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { check: Row }).check).toMatchObject({ settlement: "pass", settleNote: null });
    expect((await settle("00000000-0000-4000-8000-000000000000", { decision: "pass" })).statusCode).toBe(404);
    expect((await settle("not-a-uuid", { decision: "pass" })).statusCode).toBe(400);
  });

  it("settling an ok row or settling twice is 409", async () => {
    const ok = await staffUpload(S_I, "RC-SETTLE-OK", false);
    expect((await settle(ok.id, { decision: "pass" })).statusCode).toBe(409);
    const failed = await staffUpload(S_J, "RC-SETTLE-FAILROW", false);
    await prisma.receiptCheck.update({ where: { id: failed.id }, data: { verdict: "fail" } });
    expect((await settle(failed.id, { decision: "pass" })).statusCode).toBe(409);

    const warn = await staffUpload(S_K, "RC-SETTLE-TWICE", true);
    expect((await settle(warn.id, { decision: "fail", note: "no" })).statusCode).toBe(200);
    expect((await settle(warn.id, { decision: "pass" })).statusCode).toBe(409);
    expect((await settle(warn.id, { decision: "fail", note: "again" })).statusCode).toBe(409);
    expect(await prisma.auditLog.count({ where: { action: "receipts.check.settle", subjectId: warn.id } })).toBe(1);
  });

  it("students and anonymous callers cannot settle", async () => {
    const row = await staffUpload(S_I, "RC-SETTLE-403", true);
    expect((await settle(row.id, { decision: "pass" }, studentCookie)).statusCode).toBe(403);
    expect((await settle(row.id, { decision: "pass" }, noRoleCookie)).statusCode).toBe(403);
    const anon = await app.inject({
      method: "POST",
      url: `/api/v1/receipts/${row.id}/settle`,
      headers: { "x-requested-with": "XMLHttpRequest" },
      payload: { decision: "pass" },
    });
    expect(anon.statusCode).toBe(401);
    expect((await rowOf(S_I)).verdict).toBe("warn");
  });

  it("a staff-rejected receipt no longer holds its reference", async () => {
    const first = await staffUpload(S_I, "RC-REJECTED-REF", true);
    expect((await settle(first.id, { decision: "fail", note: "not theirs" })).statusCode).toBe(200);
    fake.reply = (call) => sidecarOk(call, { reference: "RC-REJECTED-REF" });
    const res = await pdf({ studentId: S_J, term: TERM });
    const check = (res.json() as { check: { verdict: string; checks: SidecarCheckRow[] } }).check;
    expect(check.verdict).toBe("ok");
    expect(check.checks.find((c) => c.name === "Not submitted before")?.state).toBe("ok");
  });

  it("a re-check replaces the row's file and removes the old one", async () => {
    const first = await staffUpload(S_I, "RC-RECHECK-1", true);
    const oldFile = await prisma.file.findUniqueOrThrow({ where: { id: first.fileId! } });
    const second = await staffUpload(S_I, "RC-RECHECK-2", true);
    expect(second.id).toBe(first.id);
    expect(second.fileId).not.toBeNull();
    expect(second.fileId).not.toBe(first.fileId);
    expect(await prisma.file.count({ where: { id: first.fileId! } })).toBe(0);
    expect(await exists(oldFile.storageKey)).toBe(false);
    expect((await getFile(second.id)).statusCode).toBe(200);

    // A re-check that ends ok drops the name, and one with no copy leaves no file behind.
    const third = await staffUpload(S_I, "RC-RECHECK-3", false, false);
    expect(third).toMatchObject({ fileId: null, ocrName: null, verdict: "ok" });
    expect(await prisma.file.count({ where: { id: second.fileId! } })).toBe(0);
  });

  it("a re-check of a settled row clears the settlement", async () => {
    const row = await staffUpload(S_I, "RC-RECHECK-SETTLED", true);
    expect((await settle(row.id, { decision: "fail", note: "unclear" })).statusCode).toBe(200);
    const again = await staffUpload(S_I, "RC-RECHECK-SETTLED-2", true);
    expect(again).toMatchObject({ verdict: "warn", settlement: null, settleNote: null, settledById: null, settledAt: null });
    expect(again.fileId).not.toBeNull();
  });

  it("the settle note is listed only to viewers who can manage receipts", async () => {
    const row = await staffUpload(S_J, "RC-LIST-NOTE", true);
    const settled = await settle(row.id, { decision: "fail", note: "MADE-UP-NOTE" });
    expect(settled.statusCode).toBe(200);
    const staff = await listRows(`?term=${encodeURIComponent(TERM)}`);
    const own = (staff.json() as { items: (Row & { studentId: string })[] }).items.find((i) => i.studentId === S_J)!;
    expect(own.settleNote).toBe("MADE-UP-NOTE");

    // A viewer without receipts.manage still sees the verdict, but not the note.
    await prisma.userPermission.create({ data: { userId: noRoleUserId, permission: "receipts.view", reason: "test" } });
    try {
      const viewer = await app.inject({
        method: "GET",
        url: `/api/v1/receipts?term=${encodeURIComponent(TERM)}`,
        headers: { cookie: noRoleCookie },
      });
      expect(viewer.statusCode).toBe(200);
      const seen = (viewer.json() as { items: (Row & { studentId: string })[] }).items.find((i) => i.studentId === S_J)!;
      expect(seen).toMatchObject({ settlement: "fail", settleNote: null });
      expect(viewer.body).not.toContain("MADE-UP-NOTE");
    } finally {
      await prisma.userPermission.deleteMany({ where: { userId: noRoleUserId, permission: "receipts.view" } });
    }
  });

  it("deleting a check whose file row is already gone still answers 204", async () => {
    const row = await staffUpload(S_K, "RC-DELETE-GONE", true);
    await prisma.file.deleteMany({ where: { id: row.fileId! } });
    const del = await app.inject({ method: "DELETE", url: `/api/v1/receipts/${row.id}`, headers: hdr(cookie) });
    expect(del.statusCode).toBe(204);
    expect(await prisma.receiptCheck.count({ where: { id: row.id } })).toBe(0);
  });

  it("settling a check whose file row is already gone still settles it", async () => {
    const row = await staffUpload(S_K, "RC-SETTLE-GONE", true);
    await prisma.file.deleteMany({ where: { id: row.fileId! } });
    const res = await settle(row.id, { decision: "pass", note: "" });
    expect(res.statusCode).toBe(200);
    expect(await prisma.receiptCheck.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({
      verdict: "ok",
      settlement: "pass",
      fileId: null,
    });
  });

  it("a re-check whose old file row is already gone still replaces the row", async () => {
    const first = await staffUpload(S_K, "RC-RECHECK-GONE-1", true);
    await prisma.file.deleteMany({ where: { id: first.fileId! } });
    const again = await staffUpload(S_K, "RC-RECHECK-GONE-2", true);
    expect(again.fileId).not.toBeNull();
    expect(again.fileId).not.toBe(first.fileId);
  });

  it("deleting a row deletes its file", async () => {
    const row = await staffUpload(S_I, "RC-DELETE-FILE", true);
    const file = await prisma.file.findUniqueOrThrow({ where: { id: row.fileId! } });
    const del = await app.inject({ method: "DELETE", url: `/api/v1/receipts/${row.id}`, headers: hdr(cookie) });
    expect(del.statusCode).toBe(204);
    expect(await prisma.file.count({ where: { id: file.id } })).toBe(0);
    expect(await exists(file.storageKey)).toBe(false);
  });
});

describe("receipts_use migration", () => {
  it("can run again without a duplicate-key error (ON CONFLICT DO NOTHING)", async () => {
    const sql = readFileSync(
      fileURLToPath(new URL("../../prisma/schema/migrations/20261125150000_receipts_use/migration.sql", import.meta.url)),
      "utf8",
    );
    const count = () => prisma.rolePermission.count({ where: { permission: "receipts.use" } });
    const before = await count();
    await prisma.$executeRawUnsafe(sql);
    expect(await count()).toBe(before);
  });
});
