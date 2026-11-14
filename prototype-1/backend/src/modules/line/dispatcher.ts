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

/** Most notifications pushed per tick, across all users. */
const BATCH_SIZE = 50;
/** Most due notifications read per user per tick, so one user's backlog cannot fill the batch. */
const PER_USER = 10;
/**
 * LINE's retry key is only honoured for 24 h, so a later retry could duplicate a push. Older undelivered
 * notifications are given up: they are left undelivered and never pushed.
 */
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;
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
  /** Ticks run so far. The round-robin starts one user later each tick, so a cut at BATCH_SIZE moves around. */
  rotation?: number;
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
  /**
   * Transient failure or a thrown error. Left undelivered for the next tick. A 429 counts here too. The user's
   * later rows in the same tick are not attempted and not counted: they stay due.
   */
  retry: number;
  /** 1 when LINE answered 429 this tick. The batch stopped there and the rest stay due. */
  rateLimited: number;
  /** 1 when this tick was skipped because an earlier 429 is still backing off. Nothing was sent. */
  backingOff: number;
}

type Outcome = "sent" | "permanent" | "retry" | "rateLimited";

/** The columns of a due notification that delivery needs. */
interface DueRow {
  id: string;
  userId: string;
  type: NotificationType;
  payload: unknown;
}

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

/** Takes items from each queue in turn (the first of each, then the second of each, ...) up to `cap`. */
function interleave<T>(queues: T[][], cap: number): T[] {
  const out: T[] = [];
  const longest = queues.reduce((max, q) => Math.max(max, q.length), 0);
  for (let i = 0; i < longest && out.length < cap; i++) {
    for (const q of queues) {
      if (i < q.length && out.length < cap) out.push(q[i]!);
    }
  }
  return out;
}

/**
 * Sends one batch of due notifications and prunes old webhook dedupe rows. A notification is due when it is
 * undelivered, its recipient is an active user with a LINE ID, it was created at or after that recipient
 * linked (so a new link is not flooded with older notifications), and it is younger than MAX_AGE_MS.
 * Each user's oldest due rows are read separately and taken round-robin, up to BATCH_SIZE, so one user's
 * backlog cannot hold back another's. After a user's transient failure, that user's other rows wait for the next tick.
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

  // Ordered by id, then rotated by state.rotation below, so the users cut at BATCH_SIZE differ from tick to tick.
  const users = await full.prisma.user.findMany({
    where: { lineUserId: { not: null }, lineLinkedAt: { not: null }, isActive: true },
    select: { id: true, lineUserId: true, lineLinkedAt: true },
    orderBy: { id: "asc" },
  });

  // One query per linked user, so a user with a large backlog cannot crowd out the others. The createdAt bound
  // is in each query, not a filter after `take`, or old skipped rows would fill the take and block new ones.
  const queues: { row: DueRow; lineUserId: string }[][] = [];
  for (const u of users) {
    const { lineUserId, lineLinkedAt } = u;
    if (!lineUserId || !lineLinkedAt) continue;
    const earliest = Math.max(lineLinkedAt.getTime(), full.now.getTime() - MAX_AGE_MS);
    const rows = await full.prisma.notification.findMany({
      where: { userId: u.id, deliveredLineAt: null, createdAt: { gte: new Date(earliest) } },
      orderBy: { createdAt: "asc" },
      take: PER_USER,
      select: { id: true, userId: true, type: true, payload: true },
    });
    if (rows.length > 0) queues.push(rows.map((row) => ({ row, lineUserId })));
  }

  // A user with a transient failure is left alone for the rest of this tick, so their later rows do not each fail too.
  const stopped = new Set<string>();
  const start = queues.length > 0 ? (full.state.rotation ?? 0) % queues.length : 0;
  full.state.rotation = (full.state.rotation ?? 0) + 1;
  const rotated = [...queues.slice(start), ...queues.slice(0, start)];
  for (const { row: n, lineUserId } of interleave(rotated, BATCH_SIZE)) {
    if (stopped.has(n.userId)) continue;
    let outcome: Outcome;
    try {
      outcome = await deliver(full, n, lineUserId);
    } catch (err) {
      // One bad notification must not hold up other users. Its user's later rows wait for the next tick, as on a retry.
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
    if (outcome === "retry") stopped.add(n.userId);
    counts[outcome] += 1;
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
