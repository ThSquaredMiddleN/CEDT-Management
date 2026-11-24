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
  UUID,
  auditMark,
  auditRowLeaks,
  lineAuditSince,
  webhookBody,
  type FakeLine,
} from "./fixtures.js";

/** Seeded staff accounts. Their LINE fields are reset to null after every test. */
const SOMCHAI = { email: "somchai@cedt.edu", password: "instr1234" };
const ANUCHA = { email: "anucha@cedt.edu", password: "instr1234" };
/** A student (Course Change seed). Students may link LINE too: /line/link, /line/status and /line/unlink are "user" routes. */
const STUDENT = { email: "student3@cedt.edu", password: "student1234" };

let app: FastifyInstance;
let line: FakeLine;
let somchaiCookie: string;
let anuchaCookie: string;
let studentCookie: string;

const post = (url: string, cookie: string | undefined, payload: unknown) =>
  app.inject({
    method: "POST",
    url,
    headers: { ...(cookie ? { cookie } : {}), "x-requested-with": "XMLHttpRequest" },
    payload: payload as object,
  });

const get = (url: string, cookie: string) => app.inject({ method: "GET", url, headers: { cookie } });

/** Issues a link for `lineUserId` through the webhook (a follow) and returns the raw token it was sent. */
async function issueToken(lineUserId: string): Promise<string> {
  line.reset();
  const res = await postWebhook(app, webhookBody([lineEvent({ type: "follow", userId: lineUserId })]));
  expect(res.statusCode).toBe(200);
  const raw = tokenFrom(line.sent[0]!.text);
  expect(raw).toBeDefined();
  return raw!;
}

const linkedState = async (email: string) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true, lineAccount: true } });
  return { id: user.id, lineUserId: user.lineAccount?.lineUserId ?? null, lineLinkedAt: user.lineAccount?.linkedAt ?? null };
};

beforeAll(async () => {
  line = fakeLine();
  app = await buildApp({ lineClient: line.client });
  await app.ready();
  await cleanLineState();
  somchaiCookie = await loginCookie(app, SOMCHAI.email, SOMCHAI.password);
  anuchaCookie = await loginCookie(app, ANUCHA.email, ANUCHA.password);
  studentCookie = await loginCookie(app, STUDENT.email, STUDENT.password);
});

beforeEach(async () => {
  line.reset();
  await cleanLineState();
});

afterAll(async () => {
  await cleanLineState();
  await app.close();
});

describe("POST /line/link", () => {
  it("links the caller with a valid token, marks it used, and pushes the confirmation", async () => {
    const raw = await issueToken(LINE_A);
    line.reset();

    const res = await post("/api/v1/line/link", somchaiCookie, { token: raw });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ linked: true });

    const somchai = await linkedState(SOMCHAI.email);
    expect(somchai.lineUserId).toBe(LINE_A);
    expect(somchai.lineLinkedAt).not.toBeNull();

    const row = await prisma.lineLinkToken.findUniqueOrThrow({ where: { tokenHash: hashToken(raw) } });
    expect(row.usedAt).not.toBeNull();

    expect(line.sent).toHaveLength(1);
    expect(line.sent[0]!.kind).toBe("push");
    expect(line.sent[0]!.to).toBe(LINE_A);
    expect(line.sent[0]!.retryKey).toMatch(UUID);
  });

  it("a token is single-use: the second use is 400", async () => {
    const raw = await issueToken(LINE_A);
    expect((await post("/api/v1/line/link", somchaiCookie, { token: raw })).statusCode).toBe(200);
    const again = await post("/api/v1/line/link", anuchaCookie, { token: raw });
    expect(again.statusCode).toBe(400);
    expect(again.json().error.code).toBe("BAD_REQUEST");
    expect((await linkedState(ANUCHA.email)).lineUserId).toBeNull();
  });

  it("an expired token is 400 and links nothing", async () => {
    const raw = randomBytes(32).toString("base64url");
    await prisma.lineLinkToken.create({
      data: {
        tokenHash: hashToken(raw),
        lineUserId: LINE_B,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    const res = await post("/api/v1/line/link", somchaiCookie, { token: raw });
    expect(res.statusCode).toBe(400);
    expect((await linkedState(SOMCHAI.email)).lineUserId).toBeNull();
  });

  it("an unknown token is 400", async () => {
    const res = await post("/api/v1/line/link", somchaiCookie, { token: "no-such-token" });
    expect(res.statusCode).toBe(400);
  });

  it("requires a login", async () => {
    const raw = await issueToken(LINE_A);
    const res = await post("/api/v1/line/link", undefined, { token: raw });
    expect(res.statusCode).toBe(401);
  });

  it("relinking the same LINE ID moves it off the previous user", async () => {
    const first = await issueToken(LINE_A);
    expect((await post("/api/v1/line/link", somchaiCookie, { token: first })).statusCode).toBe(200);
    expect((await linkedState(SOMCHAI.email)).lineUserId).toBe(LINE_A);

    const second = await issueToken(LINE_A);
    expect((await post("/api/v1/line/link", anuchaCookie, { token: second })).statusCode).toBe(200);

    expect((await linkedState(ANUCHA.email)).lineUserId).toBe(LINE_A);
    expect((await linkedState(SOMCHAI.email)).lineUserId).toBeNull();
  });

  it("relinking the same LINE ID leaves one audit row for the new owner and one for the user it was moved from", async () => {
    const first = await issueToken(LINE_A);
    await post("/api/v1/line/link", somchaiCookie, { token: first });
    const second = await issueToken(LINE_A);
    const mark = await auditMark();
    await post("/api/v1/line/link", anuchaCookie, { token: second });

    const somchai = await linkedState(SOMCHAI.email);
    const anucha = await linkedState(ANUCHA.email);
    const rows = await lineAuditSince(mark);
    expect(rows.map((r) => [r.action, r.subjectId, r.actorId])).toEqual([
      ["line.account.unlink", somchai.id, anucha.id],
      ["line.account.link", anucha.id, anucha.id],
    ]);
    for (const row of rows) expect(auditRowLeaks(row, first, second)).toBe(false);
  });

  it("a linked user messaging the bot gets the already-linked reply, not a new token", async () => {
    const raw = await issueToken(LINE_A);
    await post("/api/v1/line/link", somchaiCookie, { token: raw });
    line.reset();

    const res = await postWebhook(
      app,
      webhookBody([lineEvent({ type: "message", userId: LINE_A, replyToken: "rt-msg" })]),
    );
    expect(res.statusCode).toBe(200);
    expect(line.sent).toHaveLength(1);
    expect(tokenFrom(line.sent[0]!.text)).toBeUndefined();
  });
});

describe("GET /line/status and POST /line/unlink", () => {
  it("reports unlinked, then linked with a time, then unlinked again after unlink", async () => {
    const before = await get("/api/v1/line/status", somchaiCookie);
    expect(before.statusCode).toBe(200);
    expect(before.json()).toMatchObject({ enabled: true, linked: false, linkedAt: null });

    const raw = await issueToken(LINE_A);
    await post("/api/v1/line/link", somchaiCookie, { token: raw });

    const linked = await get("/api/v1/line/status", somchaiCookie);
    expect(linked.json()).toMatchObject({ enabled: true, linked: true });
    expect(typeof linked.json().linkedAt).toBe("string");
    // The LINE user ID is never returned to the browser.
    expect(linked.body).not.toContain(LINE_A);

    const unlink = await post("/api/v1/line/unlink", somchaiCookie, {});
    expect(unlink.statusCode).toBe(204);
    expect((await get("/api/v1/line/status", somchaiCookie)).json()).toMatchObject({ linked: false, linkedAt: null });
    expect((await linkedState(SOMCHAI.email)).lineUserId).toBeNull();
  });

  it("unlink removes the caller's outstanding tokens too", async () => {
    const raw = await issueToken(LINE_A);
    await post("/api/v1/line/link", somchaiCookie, { token: raw });
    await prisma.lineLinkToken.create({
      data: { tokenHash: hashToken("pending-test-token"), lineUserId: LINE_A, expiresAt: new Date(Date.now() + 60_000) },
    });

    expect((await post("/api/v1/line/unlink", somchaiCookie, {})).statusCode).toBe(204);
    expect(await prisma.lineLinkToken.count({ where: { lineUserId: LINE_A } })).toBe(0);
  });

  it("status requires a login", async () => {
    expect((await app.inject({ method: "GET", url: "/api/v1/line/status" })).statusCode).toBe(401);
  });

  it("a student can link, read status and unlink (signed-in user routes, not staff only)", async () => {
    const raw = await issueToken(LINE_A);
    expect((await post("/api/v1/line/link", studentCookie, { token: raw })).statusCode).toBe(200);

    const linked = await get("/api/v1/line/status", studentCookie);
    expect(linked.statusCode).toBe(200);
    expect(linked.json()).toMatchObject({ enabled: true, linked: true });

    expect((await post("/api/v1/line/unlink", studentCookie, {})).statusCode).toBe(204);
    expect((await linkedState(STUDENT.email)).lineUserId).toBeNull();
  });

  describe("audit rows", () => {
    it("a first link writes one line.account.link row with after.linkedAt and no before", async () => {
      const raw = await issueToken(LINE_A);
      const mark = await auditMark();
      const res = await post("/api/v1/line/link", somchaiCookie, { token: raw });
      expect(res.statusCode).toBe(200);

      const somchai = await linkedState(SOMCHAI.email);
      const rows = await lineAuditSince(mark);
      expect(rows).toHaveLength(1);
      const row = rows[0]!;
      expect(row).toMatchObject({
        actorId: somchai.id,
        module: "line",
        action: "line.account.link",
        subjectType: "user",
        subjectId: somchai.id,
        before: null,
        after: { linkedAt: somchai.lineLinkedAt!.toISOString() },
      });
      expect(auditRowLeaks(row, raw)).toBe(false);
    });

    it("linking again replaces the old link and records the old linkedAt in before", async () => {
      const first = await issueToken(LINE_A);
      await post("/api/v1/line/link", somchaiCookie, { token: first });
      const old = (await linkedState(SOMCHAI.email)).lineLinkedAt!;

      const second = await issueToken(LINE_B);
      const mark = await auditMark();
      expect((await post("/api/v1/line/link", somchaiCookie, { token: second })).statusCode).toBe(200);

      const somchai = await linkedState(SOMCHAI.email);
      expect(somchai.lineUserId).toBe(LINE_B);
      const rows = await lineAuditSince(mark);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        action: "line.account.link",
        subjectId: somchai.id,
        before: { linkedAt: old.toISOString() },
        after: { linkedAt: somchai.lineLinkedAt!.toISOString() },
      });
      expect(auditRowLeaks(rows[0]!, first, second)).toBe(false);
    });

    it("a rejected link (bad token) writes no audit row", async () => {
      const mark = await auditMark();
      expect((await post("/api/v1/line/link", somchaiCookie, { token: "no-such-token" })).statusCode).toBe(400);
      expect(await lineAuditSince(mark)).toHaveLength(0);
    });

    it("unlink writes one line.account.unlink row by the user with before.linkedAt", async () => {
      const raw = await issueToken(LINE_A);
      await post("/api/v1/line/link", somchaiCookie, { token: raw });
      const somchai = await linkedState(SOMCHAI.email);

      const mark = await auditMark();
      expect((await post("/api/v1/line/unlink", somchaiCookie, {})).statusCode).toBe(204);

      const rows = await lineAuditSince(mark);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actorId: somchai.id,
        module: "line",
        action: "line.account.unlink",
        subjectType: "user",
        subjectId: somchai.id,
        before: { linkedAt: somchai.lineLinkedAt!.toISOString() },
        after: null,
      });
      expect(auditRowLeaks(rows[0]!, raw)).toBe(false);
    });

    it("unlink when not linked writes no audit row", async () => {
      const mark = await auditMark();
      expect((await post("/api/v1/line/unlink", somchaiCookie, {})).statusCode).toBe(204);
      expect(await lineAuditSince(mark)).toHaveLength(0);
    });
  });

  it("the users table no longer has the LINE columns (they live in line_accounts)", async () => {
    const cols = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' AND column_name IN ('line_user_id', 'line_linked_at')`;
    expect(cols).toEqual([]);
  });
});

describe("JSON bodies on other routes", () => {
  it("POST /line/link parses its JSON body (a bad token reaches the handler, not a parse error)", async () => {
    const res = await post("/api/v1/line/link", somchaiCookie, { token: "x" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("BAD_REQUEST");
  });

  it("an empty token body is a validation error (422), so the JSON parser ran", async () => {
    const res = await post("/api/v1/line/link", somchaiCookie, { token: "" });
    expect(res.statusCode).toBe(422);
  });
});
