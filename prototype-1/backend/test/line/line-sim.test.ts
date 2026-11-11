import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { config } from "../../src/config.js";
import { prisma } from "../../src/db.js";
import { createDryRunLineClient } from "../../src/modules/line/client.js";
import { verifyLineSignature } from "../../src/modules/line/signature.js";
import {
  buildWebhookBody,
  DEFAULT_USER_ID,
  parseSimArgs,
  signBody,
  type SimOptions,
} from "../../scripts/line-sim.js";
import { cleanLineState } from "./fixtures.js";

const SECRET = "test-line-channel-secret";
/** Fake LINE user ID for the webhook round trips. Its rows are removed in afterAll. */
const SIM_USER = `U${"0".repeat(31)}e`;
const LINE_ID = /^U[0-9a-f]{32}$/u;
const EVENT_ID = /^[0-9A-Za-z]{1,64}$/u;

describe("line:sim body and signature", () => {
  it("default user ID passes the webhook's LINE user ID check", () => {
    expect(DEFAULT_USER_ID).toMatch(LINE_ID);
  });

  it("builds a follow with a source, reply token and link-able shape", () => {
    const event = JSON.parse(buildWebhookBody({ type: "follow" })).events[0];
    expect(event).toMatchObject({
      type: "follow",
      mode: "active",
      source: { type: "user", userId: DEFAULT_USER_ID },
      deliveryContext: { isRedelivery: false },
    });
    expect(event.webhookEventId).toMatch(EVENT_ID);
    expect(typeof event.replyToken).toBe("string");
    expect(event.message).toBeUndefined();
  });

  it("builds a message with the text, and an unfollow with no reply token", () => {
    const msg = JSON.parse(buildWebhookBody({ type: "message", text: "สวัสดี hi" })).events[0];
    expect(msg.message).toMatchObject({ type: "text", text: "สวัสดี hi" });
    expect(msg.replyToken).toBeDefined();

    const unfollow = JSON.parse(buildWebhookBody({ type: "unfollow", userId: SIM_USER })).events[0];
    expect(unfollow.type).toBe("unfollow");
    expect(unfollow.replyToken).toBeUndefined();
    expect(unfollow.source.userId).toBe(SIM_USER);
  });

  it("sets isRedelivery and gives each body a fresh webhook event ID", () => {
    const opts: SimOptions = { type: "follow", redelivery: true };
    const a = JSON.parse(buildWebhookBody(opts)).events[0];
    const b = JSON.parse(buildWebhookBody(opts)).events[0];
    expect(a.deliveryContext.isRedelivery).toBe(true);
    expect(a.webhookEventId).not.toBe(b.webhookEventId);
  });

  it("signature passes verifyLineSignature over the same bytes, including non-ASCII text", () => {
    const body = buildWebhookBody({ type: "message", text: "ภาษาไทย ✓" });
    const sig = signBody(body, SECRET);
    expect(verifyLineSignature(Buffer.from(body, "utf8"), sig, SECRET)).toBe(true);
    expect(verifyLineSignature(Buffer.from(body, "utf8"), sig, "another-secret")).toBe(false);
    expect(verifyLineSignature(Buffer.from(`${body} `, "utf8"), sig, SECRET)).toBe(false);
  });
});

describe("line:sim argument parsing", () => {
  it("reads the event type and options", () => {
    expect(parseSimArgs(["message", "--user", SIM_USER, "--text", "hello", "--redelivery", "--url", "http://x:1"])).toEqual({
      type: "message",
      userId: SIM_USER,
      text: "hello",
      redelivery: true,
      url: "http://x:1",
    });
  });

  it("defaults the user, text and url", () => {
    const args = parseSimArgs(["follow"]);
    expect(args).toMatchObject({ type: "follow", url: "http://localhost:3000" });
    expect(args.userId).toBeUndefined();
    expect(args.redelivery).toBeFalsy();
  });

  it.each([[[]], [["bogus"]], [["follow", "extra"]]])("rejects %j with a usage message", (argv) => {
    expect(() => parseSimArgs(argv)).toThrow(/Usage: npm run line:sim/);
  });
});

describe("line:sim accepted by the webhook (app.inject, dry-run client)", () => {
  let app: FastifyInstance;
  let logged: string[];
  const webhookIds: string[] = [];

  beforeAll(async () => {
    logged = [];
    app = await buildApp({ lineClient: createDryRunLineClient({ info: (m) => logged.push(m) }) });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.lineLinkToken.deleteMany({ where: { lineUserId: SIM_USER } });
    await prisma.lineWebhookEvent.deleteMany({ where: { webhookEventId: { in: webhookIds } } });
    await cleanLineState();
  });

  /** Sends one simulated event the way scripts/line-sim.ts does: built body, signed bytes, POST. */
  async function send(opts: SimOptions, secret = config.LINE_CHANNEL_SECRET ?? "") {
    const body = buildWebhookBody({ userId: SIM_USER, ...opts });
    webhookIds.push(JSON.parse(body).events[0].webhookEventId);
    return app.inject({
      method: "POST",
      url: "/api/v1/line/webhook",
      headers: { "content-type": "application/json", "x-line-signature": signBody(body, secret) },
      payload: body,
    });
  }

  const linkCount = () => prisma.lineLinkToken.count({ where: { lineUserId: SIM_USER } });

  it("follow is accepted and the reply carries a one-time link", async () => {
    logged.length = 0;
    const res = await send({ type: "follow" });
    expect(res.statusCode).toBe(200);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatch(/^\[LINE dry-run\] reply to reply: /);
    expect(logged[0]).toContain("/line/link?token=");
    expect(await linkCount()).toBe(1);
  });

  it("message from an unlinked user is answered with a fresh link", async () => {
    logged.length = 0;
    const res = await send({ type: "message", text: "hi" });
    expect(res.statusCode).toBe(200);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain("/line/link?token=");
    expect(await linkCount()).toBe(1);
  });

  it("a redelivered event is pushed to the user ID, not replied to", async () => {
    logged.length = 0;
    const res = await send({ type: "follow", redelivery: true });
    expect(res.statusCode).toBe(200);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatch(new RegExp(`^\\[LINE dry-run\\] push to ${SIM_USER}: `));
  });

  it("unfollow removes the link", async () => {
    logged.length = 0;
    const res = await send({ type: "unfollow" });
    expect(res.statusCode).toBe(200);
    expect(logged).toHaveLength(0);
    expect(await linkCount()).toBe(0);
  });

  it("a body signed with another secret is refused with 401", async () => {
    const res = await send({ type: "follow" }, "wrong-secret");
    expect(res.statusCode).toBe(401);
  });
});
