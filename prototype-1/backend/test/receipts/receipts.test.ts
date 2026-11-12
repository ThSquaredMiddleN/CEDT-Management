import net from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { config } from "../../src/config.js";
import { prisma } from "../../src/db.js";
import { currentTerm } from "../../src/modules/receipts/service.js";
import {
  MADE_UP_NAME,
  sidecarOk,
  startFakeSidecar,
  type FakeSidecar,
  type SidecarCheckRow,
} from "./fake-sidecar.js";

/**
 * Receipt checks against a fake OCR sidecar (no Python). All students, references and terms are made up.
 * Every row this file creates is deleted before and after the run, so the suite can rerun.
 */

const TERM = "2/2599"; // made-up terms, so no real rows share them
const TERM_B = "3/2599";
const S_A = "6500000001";
const S_B = "6500000002";
const S_C = "6500000003";
const S_D = "6500000004"; // default-term test
const S_E = "6500000005"; // list filters
const S_F = "6500000006"; // list filters (warn)
const S_G = "6500000007"; // delete
const S_H = "6500000008"; // sidecar errors
const TEST_STUDENTS = [S_A, S_B, S_C, S_D, S_E, S_F, S_G, S_H];

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
  await prisma.receiptCheck.deleteMany({ where: { studentId: { in: TEST_STUDENTS } } });
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

  it("lists rows newest first, with no name in the list", async () => {
    const res = await listRows(`?term=${encodeURIComponent(TERM_B)}`);
    expect(res.statusCode).toBe(200);
    const items = (res.json() as { items: { studentId: string; term: string }[] }).items;
    const mine = items.filter((i) => i.studentId === S_E || i.studentId === S_F);
    expect(mine.map((i) => i.studentId)).toEqual([S_F, S_E]);
    expect(items.every((i) => i.term === TERM_B)).toBe(true);
    expect(res.body).not.toContain(MADE_UP_NAME);
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
