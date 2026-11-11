import type { NotificationType, PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { config, lineEnabled } from "../../config.js";
import type { NotifyPayload } from "../notifications/service.js";
import type { LineClient } from "./client.js";
import { lineTextFor } from "./messages.js";

/**
 * Pushes undelivered notifications to LINE. Each notification is pushed with its own id as the retry key, so a
 * retry after an accepted push comes back 409 and counts as sent. Nothing here reads or logs message text,
 * LINE user IDs or tokens: logs carry the notification ID, its type and a status only.
 */

/** Oldest notifications handled per tick. */
const BATCH_SIZE = 50;
/** Webhook dedupe rows only matter while LINE may redeliver an event, so older ones are pruned. */
const WEBHOOK_EVENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/** After LINE answers 429, no push is sent until this much time has passed. */
export const RATE_LIMIT_BACKOFF_MS = 60 * 1000;

export interface DispatchLog {
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

const SILENT_LOG: DispatchLog = { warn() {}, error() {} };

/**
 * Kept between ticks by the caller. startLineDispatcher makes one per dispatcher; tests make one per test.
 * Keeping it out of module scope means one test's backoff cannot leak into another.
 */
export interface DispatchState {
  /** Epoch ms. Ticks before this send nothing. Set when LINE answers 429. */
  rateLimitedUntil?: number;
}

export interface DispatchDeps {
  prisma: PrismaClient;
  client: LineClient;
  appOrigin: string;
  /** Clock for deliveredLineAt, the webhook-event cutoff and the 429 backoff. Defaults to now. */
  now?: Date;
  log?: DispatchLog;
  /** Backoff state. Without one, every call starts fresh, so a 429 only holds back the rest of that call. */
  state?: DispatchState;
}

export interface DispatchCounts {
  /** LINE accepted the push (2xx, or 409 for an earlier accepted attempt). */
  sent: number;
  /** Rejected for good: LINE answered 4xx other than 429, or the payload cannot be rendered. Marked delivered. */
  permanent: number;
  /** Transient failure or a thrown error. Left undelivered for the next tick. A 429 counts here too. */
  retry: number;
  /** 1 when LINE answered 429 this tick. The batch stopped there and the rest stay due. */
  rateLimited: number;
  /** 1 when this tick was skipped because an earlier 429 is still backing off. Nothing was sent. */
  backingOff: number;
}

type Outcome = "sent" | "permanent" | "retry" | "rateLimited";

/** DispatchDeps with the defaults filled in. */
interface Resolved extends DispatchDeps {
  now: Date;
  log: DispatchLog;
  state: DispatchState;
}

function errorCodeOf(err: unknown): string {
  const code = (err as { code?: unknown } | null | undefined)?.code;
  return typeof code === "string" ? code : "unknown";
}

/**
 * One notification: render, push, then mark delivered on ok or permanent. A transient result returns before the
 * mark, so the row stays due. A render failure is marked and counted as permanent. A throw from the push or the
 * mark propagates to the caller, which counts it as a retry.
 */
async function deliver(
  deps: Resolved,
  n: { id: string; type: NotificationType; payload: unknown },
  lineUserId: string,
): Promise<Outcome> {
  let text: string;
  try {
    text = lineTextFor(n.type, n.payload as NotifyPayload, deps.appOrigin);
  } catch {
    // Rendering is deterministic, so a retry would fail the same way. Only the ID and a status are logged.
    deps.log.error({ notificationId: n.id, detail: "render_failed" }, "LINE notification could not be rendered; marked delivered");
    await deps.prisma.notification.update({ where: { id: n.id }, data: { deliveredLineAt: deps.now } });
    return "permanent";
  }

  const result = await deps.client.push(lineUserId, [{ type: "text", text }], n.id);

  if (!result.ok && !result.permanent) return result.status === 429 ? "rateLimited" : "retry";
  if (!result.ok) {
    deps.log.warn(
      { notificationId: n.id, type: n.type, status: result.status },
      "LINE rejected a notification permanently; not retried",
    );
  }
  await deps.prisma.notification.update({ where: { id: n.id }, data: { deliveredLineAt: deps.now } });
  return result.ok ? "sent" : "permanent";
}

/**
 * Sends one batch of due notifications and prunes old webhook dedupe rows. A notification is due when it is
 * undelivered, its recipient is an active user with a LINE ID, and it was created at or after that recipient
 * linked. The last rule stops a new link from flooding the user with older notifications.
 */
export async function dispatchLineOnce(deps: DispatchDeps): Promise<DispatchCounts> {
  const full: Resolved = {
    ...deps,
    now: deps.now ?? new Date(),
    log: deps.log ?? SILENT_LOG,
    state: deps.state ?? {},
  };
  const counts: DispatchCounts = { sent: 0, permanent: 0, retry: 0, rateLimited: 0, backingOff: 0 };

  const until = full.state.rateLimitedUntil;
  if (until !== undefined && full.now.getTime() < until) {
    counts.backingOff = 1;
    return counts;
  }

  const users = await full.prisma.user.findMany({
    where: { lineUserId: { not: null }, lineLinkedAt: { not: null }, isActive: true },
    select: { id: true, lineUserId: true, lineLinkedAt: true },
  });
  const linked = users.flatMap((u) =>
    u.lineUserId && u.lineLinkedAt ? [{ id: u.id, lineUserId: u.lineUserId, lineLinkedAt: u.lineLinkedAt }] : [],
  );

  if (linked.length > 0) {
    // The per-user createdAt bound has to be in the query, not a filter after `take`, or old skipped rows would
    // fill the batch and block new ones.
    const due = await full.prisma.notification.findMany({
      where: {
        deliveredLineAt: null,
        OR: linked.map((u) => ({ userId: u.id, createdAt: { gte: u.lineLinkedAt } })),
      },
      orderBy: { createdAt: "asc" },
      take: BATCH_SIZE,
      select: { id: true, userId: true, type: true, payload: true },
    });
    const lineIdByUser = new Map(linked.map((u) => [u.id, u.lineUserId]));

    for (const n of due) {
      const lineUserId = lineIdByUser.get(n.userId);
      if (lineUserId === undefined) continue;
      let outcome: Outcome;
      try {
        outcome = await deliver(full, n, lineUserId);
      } catch (err) {
        // One bad notification must not hold up the rest of the batch.
        full.log.error({ notificationId: n.id, detail: errorCodeOf(err) }, "LINE dispatch failed for one notification; will retry");
        outcome = "retry";
      }
      if (outcome === "rateLimited") {
        // LINE is limiting the channel, not this notification, so the rest of the batch waits for the backoff.
        counts.retry += 1;
        counts.rateLimited = 1;
        full.state.rateLimitedUntil = full.now.getTime() + RATE_LIMIT_BACKOFF_MS;
        break;
      }
      counts[outcome] += 1;
    }
  }

  await full.prisma.lineWebhookEvent.deleteMany({
    where: { receivedAt: { lt: new Date(full.now.getTime() - WEBHOOK_EVENT_RETENTION_MS) } },
  });
  return counts;
}

export interface StartDispatcherDeps {
  prisma: PrismaClient;
  client: LineClient;
  appOrigin: string;
  intervalMs: number;
}

/**
 * Runs dispatchLineOnce every intervalMs while the server is up. Does nothing when LINE is disabled, and never
 * under NODE_ENV=test (tests call dispatchLineOnce themselves). A tick still running blocks the next one.
 */
export function startLineDispatcher(app: FastifyInstance, deps: StartDispatcherDeps): void {
  if (!lineEnabled || config.NODE_ENV === "test") return;

  let timer: NodeJS.Timeout | undefined;
  let inFlight: Promise<void> | undefined;
  const state: DispatchState = {};

  const tick = (): void => {
    if (inFlight) return;
    inFlight = dispatchLineOnce({ ...deps, log: app.log, state })
      .then((counts) => {
        if (counts.sent + counts.permanent + counts.retry + counts.rateLimited > 0) app.log.info(counts, "LINE dispatch tick");
      })
      .catch((err) => {
        app.log.error({ detail: errorCodeOf(err) }, "LINE dispatch tick failed");
      })
      .finally(() => {
        inFlight = undefined;
      });
  };

  app.addHook("onReady", async () => {
    timer = setInterval(tick, deps.intervalMs);
  });

  app.addHook("onClose", async () => {
    clearInterval(timer);
    await inFlight;
  });
}
