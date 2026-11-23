import { createHmac } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { expect } from "vitest";
import { config } from "../../src/config.js";
import { prisma } from "../../src/db.js";
import type { LineClient, LineResult } from "../../src/modules/line/client.js";

/**
 * Shared helpers for the LINE DB tests. Every ID here is fake. The LINE secret and token come from the
 * test env in vitest.config.ts, never from the real .env.
 */

/** Fake LINE user IDs (pass the "U" + 32 hex shape check). */
export const LINE_A = `U${"0".repeat(31)}a`;
export const LINE_B = `U${"0".repeat(31)}b`;
export const EVENT_PREFIX = "testevent";

let seq = 0;
export const newEventId = (): string => `${EVENT_PREFIX}${Date.now().toString(36)}x${(seq++).toString(36)}`;

/** base64 HMAC-SHA256 of the exact body bytes, as LINE sends it. */
export function sign(body: string): string {
  return createHmac("sha256", config.LINE_CHANNEL_SECRET ?? "").update(body).digest("base64");
}

export interface TestEvent {
  type: string;
  userId?: string;
  replyToken?: string;
  isRedelivery?: boolean;
  text?: string;
  webhookEventId?: string;
}

export function lineEvent(e: TestEvent): Record<string, unknown> {
  return {
    type: e.type,
    mode: "active",
    timestamp: Date.now(),
    webhookEventId: e.webhookEventId ?? newEventId(),
    deliveryContext: { isRedelivery: e.isRedelivery ?? false },
    ...(e.userId ? { source: { type: "user", userId: e.userId } } : {}),
    replyToken: e.replyToken ?? "fakereplytoken",
    ...(e.type === "message" ? { message: { id: "1", type: "text", text: e.text ?? "hello" } } : {}),
  };
}

export const webhookBody = (events: Record<string, unknown>[]): string =>
  JSON.stringify({ destination: `U${"0".repeat(31)}d`, events });

/** POST to the webhook. Signed by default; pass `signature: null` to send no header. */
export function postWebhook(
  app: FastifyInstance,
  body: string,
  opts: { signature?: string | null; withXrw?: boolean } = {},
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const signature = opts.signature === undefined ? sign(body) : opts.signature;
  if (signature !== null) headers["x-line-signature"] = signature;
  if (opts.withXrw) headers["x-requested-with"] = "XMLHttpRequest";
  return app.inject({ method: "POST", url: "/api/v1/line/webhook", headers, payload: body });
}

export interface SentMessage {
  kind: "reply" | "push";
  to?: string;
  replyToken?: string;
  text: string;
  retryKey?: string;
}

export interface FakeLine {
  client: LineClient;
  /** Every reply and push, in order. Only ever holds fake IDs and fake text. */
  sent: SentMessage[];
  /** Queues results for the next calls. Calls past the queue succeed. */
  next(...results: LineResult[]): void;
  reset(): void;
}

export function fakeLine(): FakeLine {
  const sent: SentMessage[] = [];
  const queue: LineResult[] = [];
  const answer = async (): Promise<LineResult> => queue.shift() ?? { ok: true };
  return {
    sent,
    next: (...results) => queue.push(...results),
    reset: () => {
      sent.length = 0;
      queue.length = 0;
    },
    client: {
      async reply(replyToken, messages) {
        sent.push({ kind: "reply", replyToken, text: messages.map((m) => m.text).join("\n") });
        return answer();
      },
      async push(to, messages, retryKey) {
        sent.push({ kind: "push", to, text: messages.map((m) => m.text).join("\n"), retryKey });
        return answer();
      },
    },
  };
}

/** The raw one-time token from a link message. */
export const tokenFrom = (text: string): string | undefined => /token=([A-Za-z0-9_-]+)/.exec(text)?.[1];

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function loginCookie(app: FastifyInstance, email: string, password: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: { "x-requested-with": "XMLHttpRequest" },
    payload: { email, password },
  });
  expect(res.statusCode).toBe(200);
  const cookie = res.cookies.find((c) => c.name === config.SESSION_COOKIE_NAME);
  return `${config.SESSION_COOKIE_NAME}=${cookie!.value}`;
}

/** Removes every row a LINE test can create: fake-ID tokens, fake event IDs, and links to fake IDs. */
export async function cleanLineState(): Promise<void> {
  await prisma.user.updateMany({
    where: { lineUserId: { in: [LINE_A, LINE_B] } },
    data: { lineUserId: null, lineLinkedAt: null },
  });
  await prisma.lineLinkToken.deleteMany({ where: { lineUserId: { in: [LINE_A, LINE_B] } } });
  await prisma.lineWebhookEvent.deleteMany({ where: { webhookEventId: { startsWith: EVENT_PREFIX } } });
}
