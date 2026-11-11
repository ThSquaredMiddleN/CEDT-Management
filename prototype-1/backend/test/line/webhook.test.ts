import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { config } from "../../src/config.js";
import { prisma } from "../../src/db.js";
import { hashToken } from "../../src/plugins/auth.js";
import {
  cleanLineState,
  EVENT_PREFIX,
  fakeLine,
  lineEvent,
  LINE_A,
  loginCookie,
  newEventId,
  postWebhook,
  tokenFrom,
  UUID,
  webhookBody,
  type FakeLine,
} from "./fixtures.js";

let app: FastifyInstance;
let line: FakeLine;

const countEvents = () =>
  prisma.lineWebhookEvent.count({ where: { webhookEventId: { startsWith: EVENT_PREFIX } } });
const countTokensFor = (lineUserId: string) => prisma.lineLinkToken.count({ where: { lineUserId } });

beforeAll(async () => {
  line = fakeLine();
  app = await buildApp({ lineClient: line.client });
  await app.ready();
  await cleanLineState();
});

beforeEach(async () => {
  line.reset();
  await cleanLineState();
});

afterAll(async () => {
  await cleanLineState();
  await app.close();
});

describe("webhook signature", () => {
  it("answers 401 for a bad signature and writes nothing", async () => {
    const body = webhookBody([lineEvent({ type: "follow", userId: LINE_A })]);
    const res = await postWebhook(app, body, { signature: "not-the-signature" });
    expect(res.statusCode).toBe(401);
    expect(await countEvents()).toBe(0);
    expect(await countTokensFor(LINE_A)).toBe(0);
    expect(line.sent).toHaveLength(0);
  });

  it("answers 401 for a missing signature header", async () => {
    const body = webhookBody([lineEvent({ type: "follow", userId: LINE_A })]);
    const res = await postWebhook(app, body, { signature: null });
    expect(res.statusCode).toBe(401);
    expect(await countEvents()).toBe(0);
  });

  it("checks the signature before parsing: a bad signature on malformed JSON is 401, not 400", async () => {
    const res = await postWebhook(app, "{not json", { signature: "bad" });
    expect(res.statusCode).toBe(401);
  });

  it("answers 400 for malformed JSON that carries a valid signature", async () => {
    const res = await postWebhook(app, "{not json");
    expect(res.statusCode).toBe(400);
  });

  it("accepts the webhook without X-Requested-With, while other POSTs without it are still 403", async () => {
    const webhook = await postWebhook(app, webhookBody([]), { withXrw: false });
    expect(webhook.statusCode).toBe(200);

    const other = await app.inject({
      method: "POST",
      url: "/api/v1/line/unlink",
      headers: { "content-type": "application/json" },
      payload: {},
    });
    expect(other.statusCode).toBe(403);
  });
});

describe("webhook events", () => {
  it("follow replies with a link, and the token is stored hashed", async () => {
    const res = await postWebhook(app, webhookBody([lineEvent({ type: "follow", userId: LINE_A, replyToken: "rt-follow" })]));
    expect(res.statusCode).toBe(200);

    expect(line.sent).toHaveLength(1);
    const sent = line.sent[0]!;
    expect(sent.kind).toBe("reply");
    expect(sent.replyToken).toBe("rt-follow");

    const raw = tokenFrom(sent.text);
    expect(raw).toBeDefined();
    expect(sent.text).toContain(`${config.APP_ORIGIN}/line/link?token=${raw}`);

    const rows = await prisma.lineLinkToken.findMany({ where: { lineUserId: LINE_A } });
    const [row] = rows;
    expect(rows).toHaveLength(1);
    expect(row!.tokenHash).toBe(hashToken(raw!));
    expect(row!.tokenHash).not.toBe(raw);
    expect(row!.usedAt).toBeNull();
    const ttlMs = row!.expiresAt.getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(14 * 60_000);
    expect(ttlMs).toBeLessThanOrEqual(15 * 60_000);
  });

  it("a redelivered event is answered by push with a fresh retry key, not by reply", async () => {
    const res = await postWebhook(
      app,
      webhookBody([lineEvent({ type: "follow", userId: LINE_A, replyToken: "rt-stale", isRedelivery: true })]),
    );
    expect(res.statusCode).toBe(200);

    expect(line.sent).toHaveLength(1);
    expect(line.sent[0]!.kind).toBe("push");
    expect(line.sent[0]!.to).toBe(LINE_A);
    expect(line.sent[0]!.retryKey).toMatch(UUID);
    expect(tokenFrom(line.sent[0]!.text)).toBeDefined();
  });

  it("handles a duplicate webhookEventId once", async () => {
    const id = newEventId();
    const body = webhookBody([lineEvent({ type: "follow", userId: LINE_A, webhookEventId: id })]);

    expect((await postWebhook(app, body)).statusCode).toBe(200);
    expect((await postWebhook(app, body)).statusCode).toBe(200);

    expect(line.sent).toHaveLength(1);
    expect(await countTokensFor(LINE_A)).toBe(1);
    expect(await prisma.lineWebhookEvent.count({ where: { webhookEventId: id } })).toBe(1);
  });

  it("runs two events from one LINE user in order: the later link token is the one left valid", async () => {
    const body = webhookBody([
      lineEvent({ type: "follow", userId: LINE_A, replyToken: "rt-first" }),
      lineEvent({ type: "message", userId: LINE_A, replyToken: "rt-second" }),
    ]);
    const res = await postWebhook(app, body);
    expect(res.statusCode).toBe(200);

    expect(line.sent.map((s) => s.replyToken)).toEqual(["rt-first", "rt-second"]);
    const rows = await prisma.lineLinkToken.findMany({ where: { lineUserId: LINE_A } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(hashToken(tokenFrom(line.sent[1]!.text)!));
  });

  it("answers 500 when the handler fails, then a redelivery succeeds", async () => {
    const id = newEventId();
    const first = webhookBody([lineEvent({ type: "follow", userId: LINE_A, webhookEventId: id, replyToken: "rt-1" })]);

    line.next({ ok: false, status: 503, permanent: false });
    const failed = await postWebhook(app, first);
    expect(failed.statusCode).toBe(500);
    // The dedupe row is removed and the unsent link is revoked.
    expect(await prisma.lineWebhookEvent.count({ where: { webhookEventId: id } })).toBe(0);
    expect(await countTokensFor(LINE_A)).toBe(0);

    const redelivery = webhookBody([
      lineEvent({ type: "follow", userId: LINE_A, webhookEventId: id, replyToken: "rt-1", isRedelivery: true }),
    ]);
    const ok = await postWebhook(app, redelivery);
    expect(ok.statusCode).toBe(200);
    expect(line.sent.map((s) => s.kind)).toEqual(["reply", "push"]);
    expect(await prisma.lineWebhookEvent.count({ where: { webhookEventId: id } })).toBe(1);
    expect(await countTokensFor(LINE_A)).toBe(1);
  });

  it("swallows a permanent LINE rejection: 200, and the unsent link is revoked", async () => {
    line.next({ ok: false, status: 400, permanent: true });
    const res = await postWebhook(app, webhookBody([lineEvent({ type: "follow", userId: LINE_A })]));
    expect(res.statusCode).toBe(200);
    expect(await countTokensFor(LINE_A)).toBe(0);
  });

  it("linked user gets an already-linked reply to text, and no new token", async () => {
    await prisma.user.update({
      where: { email: "somchai@cedt.edu" },
      data: { lineUserId: LINE_A, lineLinkedAt: new Date() },
    });
    const res = await postWebhook(app, webhookBody([lineEvent({ type: "message", userId: LINE_A, replyToken: "rt-msg" })]));
    expect(res.statusCode).toBe(200);
    expect(line.sent).toHaveLength(1);
    expect(line.sent[0]!.kind).toBe("reply");
    expect(tokenFrom(line.sent[0]!.text)).toBeUndefined();
    expect(await countTokensFor(LINE_A)).toBe(0);
  });

  it("a deactivated linked user gets the link prompt, not the already-linked reply, and no name", async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "somchai@cedt.edu" },
      select: { id: true, name: true, isActive: true },
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { lineUserId: LINE_A, lineLinkedAt: new Date(), isActive: false },
    });
    try {
      const res = await postWebhook(app, webhookBody([lineEvent({ type: "message", userId: LINE_A, replyToken: "rt-msg" })]));
      expect(res.statusCode).toBe(200);
      expect(line.sent).toHaveLength(1);
      expect(line.sent[0]!.kind).toBe("reply");
      expect(line.sent[0]!.text).not.toContain(user.name);
      expect(tokenFrom(line.sent[0]!.text)).toBeDefined();
      expect(await countTokensFor(LINE_A)).toBe(1);
    } finally {
      await prisma.user.update({ where: { id: user.id }, data: { isActive: user.isActive } });
    }
  });

  it("unfollow clears the link and the user's tokens", async () => {
    await prisma.user.update({
      where: { email: "somchai@cedt.edu" },
      data: { lineUserId: LINE_A, lineLinkedAt: new Date() },
    });
    await prisma.lineLinkToken.create({
      data: { tokenHash: hashToken("unused-test-token"), lineUserId: LINE_A, expiresAt: new Date(Date.now() + 60_000) },
    });

    const res = await postWebhook(app, webhookBody([lineEvent({ type: "unfollow", userId: LINE_A })]));
    expect(res.statusCode).toBe(200);
    expect(line.sent).toHaveLength(0);

    const somchai = await prisma.user.findUniqueOrThrow({ where: { email: "somchai@cedt.edu" } });
    expect(somchai.lineUserId).toBeNull();
    expect(somchai.lineLinkedAt).toBeNull();
    expect(await countTokensFor(LINE_A)).toBe(0);
  });
});
