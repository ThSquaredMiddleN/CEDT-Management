import { randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { config, lineEnabled } from "../../config.js";
import { prisma } from "../../db.js";
import { AppError, badRequest, isUniqueViolation, unauthenticated } from "../../lib/errors.js";
import { hashToken, requireUser } from "../../plugins/auth.js";
import { createLineClient, type LineClient, type LineMessage } from "./client.js";
import { alreadyLinked, linkedOk, linkPrompt } from "./messages.js";
import { verifyLineSignature } from "./signature.js";

export interface LineRouteOptions {
  /** Tests pass a fake client. Production builds one from LINE_CHANNEL_ACCESS_TOKEN. */
  client?: LineClient;
}

const LINK_INVALID = "This link is invalid, expired or already used. Message the LINE account again for a new one.";
const MAX_EVENTS = 100;
const WEBHOOK_EVENT_ID = /^[0-9A-Za-z]{1,64}$/u;
const LINE_USER_ID = /^U[0-9a-f]{32}$/u;

const linkBody = z.object({ token: z.string().min(1).max(200) });

/** A LINE event after shape checks. Message text and the raw event are not kept, so nothing can log them. */
interface LineEvent {
  type: string;
  webhookEventId: string;
  userId?: string;
  replyToken?: string;
  isRedelivery: boolean;
  messageType?: string;
}

interface Ctx {
  client: LineClient;
  log: { warn: (o: object, m: string) => void; error: (o: object, m: string) => void };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** LINE's webhook JSON is untrusted: each field is checked, and an event that fails is dropped, not reported. */
export function parseEvents(body: unknown): LineEvent[] {
  if (!isRecord(body) || !Array.isArray(body.events)) return [];
  const events: LineEvent[] = [];
  for (const item of body.events.slice(0, MAX_EVENTS)) {
    if (!isRecord(item) || typeof item.type !== "string") continue;
    const { webhookEventId } = item;
    if (typeof webhookEventId !== "string" || !WEBHOOK_EVENT_ID.test(webhookEventId)) continue;

    const event: LineEvent = {
      type: item.type,
      webhookEventId,
      isRedelivery: isRecord(item.deliveryContext) && item.deliveryContext.isRedelivery === true,
    };
    const { source, replyToken, message } = item;
    if (isRecord(source) && source.type === "user" && typeof source.userId === "string" && LINE_USER_ID.test(source.userId)) {
      event.userId = source.userId;
    }
    if (typeof replyToken === "string" && replyToken.length >= 1 && replyToken.length <= 256) {
      event.replyToken = replyToken;
    }
    if (isRecord(message) && typeof message.type === "string") event.messageType = message.type;
    events.push(event);
  }
  return events;
}

/**
 * Sends the messages once. Reply when the event is a first delivery with a reply token; otherwise push.
 * A redelivery's reply token is likely spent, so it is always pushed, with a fresh retry key per attempt:
 * a stable key would make LINE answer 409 to a retry whose first attempt never got a response back.
 * Returns false on a permanent LINE rejection (drop it). Throws on a transient one (429, 5xx, network),
 * so the webhook answers 500 and LINE redelivers.
 */
async function send(client: LineClient, event: LineEvent, userId: string, messages: LineMessage[]): Promise<boolean> {
  const usePush = event.isRedelivery || event.replyToken === undefined;
  const result = usePush
    ? await client.push(userId, messages, randomUUID())
    : await client.reply(event.replyToken as string, messages);
  if (result.ok) return true;
  if (result.permanent) return false;
  throw new LineSendError(result.status);
}

class LineSendError extends Error {
  constructor(readonly status: number | null) {
    super("LINE send failed");
  }
}

/** Issues a fresh one-time link (only the newest per LINE user is valid) and sends it. */
async function offerLink(ctx: Ctx, event: LineEvent, userId: string): Promise<void> {
  const raw = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + config.LINE_LINK_TTL_MINUTES * 60_000);
  await prisma.$transaction([
    prisma.lineLinkToken.deleteMany({ where: { lineUserId: userId } }),
    prisma.lineLinkToken.create({ data: { tokenHash, lineUserId: userId, expiresAt } }),
  ]);

  let sent: boolean;
  try {
    sent = await send(ctx.client, event, userId, [{ type: "text", text: linkPrompt(`${config.APP_ORIGIN}/line/link?token=${raw}`) }]);
  } catch (err) {
    // The user never got this link, so it must not stay usable.
    await prisma.lineLinkToken.deleteMany({ where: { tokenHash } });
    throw err;
  }
  if (!sent) {
    await prisma.lineLinkToken.deleteMany({ where: { tokenHash } });
    ctx.log.warn({ eventType: event.type }, "LINE rejected the link message permanently; not retried");
  }
}

async function handleEvent(ctx: Ctx, event: LineEvent): Promise<void> {
  const { userId } = event;
  if (userId === undefined) return;

  if (event.type === "follow") {
    await offerLink(ctx, event, userId);
    return;
  }

  if (event.type === "unfollow") {
    await prisma.$transaction([
      prisma.user.updateMany({ where: { lineUserId: userId }, data: { lineUserId: null, lineLinkedAt: null } }),
      prisma.lineLinkToken.deleteMany({ where: { lineUserId: userId } }),
    ]);
    return;
  }

  // Only text gets an answer, and only when the event can be answered (reply token, or a redelivery to push).
  const canAnswer = event.replyToken !== undefined || event.isRedelivery;
  if (event.type === "message" && event.messageType === "text" && canAnswer) {
    // A deactivated user counts as unlinked here: no name is shown, and a new link is offered.
    const linked = await prisma.user.findUnique({
      where: { lineUserId: userId, isActive: true },
      select: { name: true },
    });
    if (linked) {
      await send(ctx.client, event, userId, [{ type: "text", text: alreadyLinked(linked.name) }]);
      return;
    }
    await offerLink(ctx, event, userId);
  }
}

/**
 * Event IDs this process is handling now. A redelivery that arrives during the first attempt must not be skipped.
 * Per process: this holds for the prototype's single backend instance, not across several.
 */
const inFlight = new Set<string>();

/**
 * Records the event ID, runs the handler, then sets handledAt. A redelivery is skipped only when handledAt is set;
 * a record left unmarked (the handler failed, or the process died) runs again. A redelivery that arrives while this
 * process is still handling the event answers false, so LINE redelivers it later. Returns true when the event is done.
 */
async function runEvent(ctx: Ctx, event: LineEvent): Promise<boolean> {
  const { webhookEventId } = event;
  // Checked and claimed before the insert, so no await sits between a redelivery's check and the claim.
  if (inFlight.has(webhookEventId)) return false;
  inFlight.add(webhookEventId);
  try {
    try {
      await prisma.lineWebhookEvent.create({ data: { webhookEventId } });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const row = await prisma.lineWebhookEvent.findUnique({ where: { webhookEventId }, select: { handledAt: true } });
      if (row?.handledAt) return true;
      // Not marked handled: an earlier attempt failed or stopped before it finished. Run it again.
    }

    try {
      await handleEvent(ctx, event);
    } catch (err) {
      // Log the event type and a status only: never the event, user ID, token or Prisma message.
      ctx.log.error(
        { eventType: event.type, detail: err instanceof LineSendError ? err.status : errorCodeOf(err) },
        "LINE event handler failed; LINE will redeliver",
      );
      return false;
    }

    try {
      await prisma.lineWebhookEvent.update({ where: { webhookEventId }, data: { handledAt: new Date() } });
    } catch (err) {
      // The handler's effects are done, so this still answers true: a 500 would make LINE run them again.
      ctx.log.error(
        { eventType: event.type, detail: errorCodeOf(err) },
        "LINE event handled but its completion mark was not saved",
      );
    }
    return true;
  } finally {
    // Released after the mark: a redelivery in between still sees the ID in flight and gets a 500, not a skip.
    inFlight.delete(webhookEventId);
  }
}

function errorCodeOf(err: unknown): string {
  if (err instanceof AppError) return err.code;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" ? code : "unknown";
}

/**
 * Events from one LINE user run one after another in order (a follow before a message matters). Different
 * users run at the same time, so one slow reply does not hold up the others. Any failure answers 500.
 */
async function processBatch(ctx: Ctx, events: LineEvent[]): Promise<boolean> {
  const groups = new Map<string | undefined, LineEvent[]>();
  for (const event of events) {
    const group = groups.get(event.userId);
    if (group) group.push(event);
    else groups.set(event.userId, [event]);
  }
  const results = await Promise.allSettled(
    [...groups.values()].map(async (group) => {
      let allOk = true;
      for (const event of group) {
        if (!(await runEvent(ctx, event))) allOk = false;
      }
      return allOk;
    }),
  );
  return results.every((r) => r.status === "fulfilled" && r.value);
}

const webhookPlugin: FastifyPluginAsync<{ client: LineClient }> = async (app, opts) => {
  // Scoped to this encapsulated plugin: only the webhook gets the raw Buffer body.
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });

  // csrf: false is safe because the LINE signature is the authentication for this route.
  app.post("/line/webhook", { config: { auth: "public", csrf: false } }, async (req) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    // The signature is checked over the bytes as received, before anything is parsed.
    const signature = req.headers["x-line-signature"];
    if (
      typeof signature !== "string" ||
      !verifyLineSignature(raw, signature, config.LINE_CHANNEL_SECRET ?? "")
    ) {
      throw unauthenticated("Invalid LINE signature");
    }

    let body: unknown;
    try {
      body = JSON.parse(raw.toString("utf8"));
    } catch {
      throw badRequest("Malformed JSON");
    }

    const ok = await processBatch({ client: opts.client, log: req.log }, parseEvents(body));
    if (!ok) throw new AppError("INTERNAL", "LINE events could not be handled; LINE will redeliver");
    return { ok: true };
  });
};

export const lineRoutes: FastifyPluginAsync<LineRouteOptions> = async (app: FastifyInstance, opts) => {
  const client = opts.client ?? (lineEnabled ? createLineClient(config.LINE_CHANNEL_ACCESS_TOKEN ?? "") : undefined);

  if (lineEnabled && client) {
    await app.register(webhookPlugin, { client });
  }

  app.post("/line/link", { config: { auth: "any" } }, async (req) => {
    const me = requireUser(req);
    const { token } = linkBody.parse(req.body);
    const now = new Date();

    const row = await prisma.lineLinkToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!row || row.usedAt !== null || row.expiresAt <= now) throw badRequest(LINK_INVALID);

    const { lineUserId } = row;
    await prisma.$transaction(async (tx) => {
      // Claimed with a conditional update, so two concurrent requests with one token cannot both win.
      const claimed = await tx.lineLinkToken.updateMany({
        where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) throw badRequest(LINK_INVALID);
      // LINE IDs are unique: take it off whoever held it before (relinking moves it).
      await tx.user.updateMany({ where: { lineUserId }, data: { lineUserId: null, lineLinkedAt: null } });
      await tx.user.update({ where: { id: me.id }, data: { lineUserId, lineLinkedAt: now } });
    });

    if (client) {
      const result = await client.push(lineUserId, [{ type: "text", text: linkedOk() }], randomUUID());
      // The link is already saved. A failed confirmation does not undo it, so it is only logged.
      if (!result.ok) req.log.warn({ status: result.status }, "LINE link confirmation not delivered");
    }
    return { linked: true, linkedAt: now.toISOString() };
  });

  app.get("/line/status", { config: { auth: "any" } }, async (req) => {
    const me = requireUser(req);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: me.id },
      select: { lineUserId: true, lineLinkedAt: true },
    });
    return {
      enabled: lineEnabled,
      linked: user.lineUserId !== null,
      linkedAt: user.lineLinkedAt?.toISOString() ?? null,
    };
  });

  app.post("/line/unlink", { config: { auth: "any" } }, async (req, reply) => {
    const me = requireUser(req);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id }, select: { lineUserId: true } });
    await prisma.$transaction([
      ...(user.lineUserId ? [prisma.lineLinkToken.deleteMany({ where: { lineUserId: user.lineUserId } })] : []),
      prisma.user.update({ where: { id: me.id }, data: { lineUserId: null, lineLinkedAt: null } }),
    ]);
    return reply.code(204).send();
  });
};

