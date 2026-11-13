import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../../src/config.js";
import { prisma } from "../../src/db.js";
import { createLineClient, type FetchFn, type LineClient } from "../../src/modules/line/client.js";
import {
  dispatchLineOnce,
  type DispatchCounts,
  type DispatchLog,
  type DispatchState,
  MAX_AGE_MS,
  RATE_LIMIT_BACKOFF_MS,
} from "../../src/modules/line/dispatcher.js";
import { cleanLineState, fakeLine, LINE_A, LINE_B, newEventId, UUID } from "./fixtures.js";

/** Seeded staff accounts. Their LINE fields are reset to null after every test. */
const SOMCHAI = "somchai@cedt.edu";
const ANUCHA = "anucha@cedt.edu";

/** Marks every notification this file creates, so cleanup can find them. */
const MARK = "dispatcher-test";
const DAY_MS = 24 * 60 * 60 * 1000;

const line = fakeLine();

/** A minimal fake NotifyPayload. Only fake codes, rooms and times. */
const PAYLOAD = {
  bookingId: "00000000-0000-4000-8000-000000000000",
  requestNo: "DT-0001",
  courseCode: "TST0000",
  roomName: "Test Room",
  date: "2030-01-01",
  startTime: "09:00",
  endTime: "10:00",
};

/** A DispatchCounts with every field 0 unless overridden. */
const tally = (over: Partial<DispatchCounts> = {}): DispatchCounts => ({
  sent: 0,
  permanent: 0,
  retry: 0,
  rateLimited: 0,
  backingOff: 0,
  ...over,
});

/** Fake LINE ID prefix for the test that links all six users: the seed has five, so one extra user is added. */
const CAP_PREFIX = `U${"0".repeat(29)}c`;
const EXTRA_EMAIL = "dispatcher-test-extra@example.test";

/** Creates the extra user. It has no notifications from other tests, so a test can link it as far back as it needs. */
async function extraUser(): Promise<string> {
  const user = await prisma.user.create({
    data: { email: EXTRA_EMAIL, passwordHash: "not-a-login", name: "Dispatcher Test", role: "staff" },
    select: { id: true },
  });
  return user.id;
}

async function cleanup(): Promise<void> {
  await prisma.notification.deleteMany({ where: { message: { startsWith: MARK } } });
  await prisma.user.updateMany({
    where: { lineUserId: { startsWith: CAP_PREFIX } },
    data: { lineUserId: null, lineLinkedAt: null },
  });
  await prisma.user.deleteMany({ where: { email: EXTRA_EMAIL } });
  await cleanLineState();
}

/** Links a seeded user to a fake LINE ID as of `linkedAt`. */
async function link(email: string, lineUserId: string, linkedAt: Date): Promise<void> {
  await prisma.user.update({ where: { email }, data: { lineUserId, lineLinkedAt: linkedAt } });
}

/** Runs `fn` with the seeded user deactivated, then puts back the flag they had before. */
async function deactivated(email: string, fn: () => Promise<void>): Promise<void> {
  const { isActive } = await prisma.user.findUniqueOrThrow({ where: { email }, select: { isActive: true } });
  await prisma.user.update({ where: { email }, data: { isActive: false } });
  try {
    await fn();
  } finally {
    await prisma.user.update({ where: { email }, data: { isActive } });
  }
}

async function addNotification(email: string, createdAt: Date, payload: Record<string, string> = PAYLOAD): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
  const row = await prisma.notification.create({
    data: { userId: user.id, type: "request_submitted", message: `${MARK} fake`, payload, createdAt },
  });
  return row.id;
}

const deliveredAt = async (id: string): Promise<Date | null> =>
  (await prisma.notification.findUniqueOrThrow({ where: { id }, select: { deliveredLineAt: true } })).deliveredLineAt;

interface RunOptions {
  client?: LineClient;
  log?: DispatchLog;
  now?: Date;
  state?: DispatchState;
}

const dispatch = (opts: RunOptions = {}) =>
  dispatchLineOnce({
    prisma,
    client: opts.client ?? line.client,
    appOrigin: config.APP_ORIGIN,
    log: opts.log,
    now: opts.now,
    state: opts.state,
  });

beforeEach(async () => {
  line.reset();
  await cleanup();
});

afterAll(async () => {
  await cleanup();
});

describe("dispatchLineOnce", () => {
  it("sends a notification created after the user linked, to their LINE ID", async () => {
    const linkedAt = new Date();
    await link(SOMCHAI, LINE_A, linkedAt);
    const id = await addNotification(SOMCHAI, new Date(linkedAt.getTime() + 1000));

    const counts = await dispatch();

    expect(counts).toEqual(tally({ sent: 1 }));
    expect(line.sent).toHaveLength(1);
    expect(line.sent[0]).toMatchObject({ kind: "push", to: LINE_A });
    expect(line.sent[0]!.text).toContain("DT-0001");
    expect(line.sent[0]!.text).toContain(`${config.APP_ORIGIN}/admin/dashboard`);
    expect(await deliveredAt(id)).not.toBeNull();
  });

  it("skips notifications created before the user linked", async () => {
    const linkedAt = new Date();
    await link(SOMCHAI, LINE_A, linkedAt);
    const id = await addNotification(SOMCHAI, new Date(linkedAt.getTime() - 60_000));

    const counts = await dispatch();

    expect(counts).toEqual(tally());
    expect(line.sent).toHaveLength(0);
    expect(await deliveredAt(id)).toBeNull();
  });

  it("skips users with no LINE link, and still sends to linked users in the same tick", async () => {
    const linkedAt = new Date();
    await link(SOMCHAI, LINE_A, linkedAt);
    const linkedId = await addNotification(SOMCHAI, new Date(linkedAt.getTime() + 1000));
    const unlinkedId = await addNotification(ANUCHA, new Date(linkedAt.getTime() + 1000));

    const counts = await dispatch();

    expect(counts).toEqual(tally({ sent: 1 }));
    expect(line.sent.map((s) => s.to)).toEqual([LINE_A]);
    expect(await deliveredAt(linkedId)).not.toBeNull();
    expect(await deliveredAt(unlinkedId)).toBeNull();
  });

  it("skips a deactivated user even when linked: nothing is sent and nothing is marked", async () => {
    const linkedAt = new Date();
    await link(SOMCHAI, LINE_A, linkedAt);
    const id = await addNotification(SOMCHAI, new Date(linkedAt.getTime() + 1000));

    await deactivated(SOMCHAI, async () => {
      expect(await dispatch()).toEqual(tally());
    });

    expect(line.sent).toHaveLength(0);
    expect(await deliveredAt(id)).toBeNull();
  });

  it("uses the notification ID as the retry key, one per notification", async () => {
    const linkedAt = new Date();
    await link(SOMCHAI, LINE_A, linkedAt);
    const first = await addNotification(SOMCHAI, new Date(linkedAt.getTime() + 1000));
    const second = await addNotification(SOMCHAI, new Date(linkedAt.getTime() + 2000));

    await dispatch();

    expect(line.sent.map((s) => s.retryKey)).toEqual([first, second]);
    expect(first).toMatch(UUID);
    expect(second).toMatch(UUID);
  });

  it("leaves a 429 undelivered, and the next tick after the backoff delivers it with the same retry key", async () => {
    const linkedAt = new Date();
    await link(SOMCHAI, LINE_A, linkedAt);
    const id = await addNotification(SOMCHAI, new Date(linkedAt.getTime() + 1000));
    const state: DispatchState = {};
    const t0 = new Date();

    line.next({ ok: false, status: 429, permanent: false });
    expect(await dispatch({ now: t0, state })).toEqual(tally({ retry: 1, rateLimited: 1 }));
    expect(await deliveredAt(id)).toBeNull();

    expect(await dispatch({ now: new Date(t0.getTime() + RATE_LIMIT_BACKOFF_MS), state })).toEqual(tally({ sent: 1 }));
    expect(await deliveredAt(id)).not.toBeNull();
    expect(line.sent).toHaveLength(2);
    expect(line.sent.map((s) => s.retryKey)).toEqual([id, id]);
  });

  it("on a 429 at the first of three, pushes only that one, waits out the backoff, then delivers all three", async () => {
    const linkedAt = new Date();
    await link(SOMCHAI, LINE_A, linkedAt);
    const first = await addNotification(SOMCHAI, new Date(linkedAt.getTime() + 1000));
    const second = await addNotification(SOMCHAI, new Date(linkedAt.getTime() + 2000));
    const third = await addNotification(SOMCHAI, new Date(linkedAt.getTime() + 3000));
    const state: DispatchState = {};
    const t0 = new Date();

    line.next({ ok: false, status: 429, permanent: false });
    expect(await dispatch({ now: t0, state })).toEqual(tally({ retry: 1, rateLimited: 1 }));
    expect(line.sent.map((s) => s.retryKey)).toEqual([first]);
    expect(await deliveredAt(first)).toBeNull();
    expect(await deliveredAt(second)).toBeNull();
    expect(await deliveredAt(third)).toBeNull();

    // Inside the backoff: the tick sends nothing and does not touch LINE.
    const inside = new Date(t0.getTime() + RATE_LIMIT_BACKOFF_MS - 1000);
    expect(await dispatch({ now: inside, state })).toEqual(tally({ backingOff: 1 }));
    expect(line.sent).toHaveLength(1);

    // After the backoff: all three go out in order, the first with the same key as its 429 attempt.
    const after = new Date(t0.getTime() + RATE_LIMIT_BACKOFF_MS + 1000);
    expect(await dispatch({ now: after, state })).toEqual(tally({ sent: 3 }));
    expect(line.sent.map((s) => s.retryKey)).toEqual([first, first, second, third]);
    expect(await deliveredAt(first)).not.toBeNull();
    expect(await deliveredAt(second)).not.toBeNull();
    expect(await deliveredAt(third)).not.toBeNull();
  });

  it("marks a permanent 400 as delivered, so it is not pushed again", async () => {
    const linkedAt = new Date();
    await link(SOMCHAI, LINE_A, linkedAt);
    const id = await addNotification(SOMCHAI, new Date(linkedAt.getTime() + 1000));

    line.next({ ok: false, status: 400, permanent: true });
    expect(await dispatch()).toEqual(tally({ permanent: 1 }));
    expect(await deliveredAt(id)).not.toBeNull();

    expect(await dispatch()).toEqual(tally());
    expect(line.sent).toHaveLength(1);
  });

  it("marks a notification whose payload cannot be rendered, and still sends the valid one after it", async () => {
    const linkedAt = new Date();
    await link(SOMCHAI, LINE_A, linkedAt);
    const empty = await addNotification(SOMCHAI, new Date(linkedAt.getTime() + 1000), {});
    const badDate = await addNotification(SOMCHAI, new Date(linkedAt.getTime() + 2000), {
      ...PAYLOAD,
      date: "not-a-date",
    });
    const valid = await addNotification(SOMCHAI, new Date(linkedAt.getTime() + 3000));
    const log = { warn: vi.fn(), error: vi.fn() };

    expect(await dispatch({ log })).toEqual(tally({ sent: 1, permanent: 2 }));

    expect(line.sent.map((s) => s.retryKey)).toEqual([valid]);
    expect(await deliveredAt(empty)).not.toBeNull();
    expect(await deliveredAt(badDate)).not.toBeNull();
    expect(await deliveredAt(valid)).not.toBeNull();
    expect(log.error).toHaveBeenCalledWith({ notificationId: empty, detail: "render_failed" }, expect.any(String));
    expect(log.error).toHaveBeenCalledWith({ notificationId: badDate, detail: "render_failed" }, expect.any(String));
  });

  it("counts a 409 on push as sent, using the real client over a fake fetch", async () => {
    const linkedAt = new Date();
    await link(SOMCHAI, LINE_A, linkedAt);
    const id = await addNotification(SOMCHAI, new Date(linkedAt.getTime() + 1000));

    const headers: Record<string, string>[] = [];
    const fetch409: FetchFn = async (_url, init) => {
      headers.push(init.headers as Record<string, string>);
      return new Response("{}", { status: 409 });
    };

    const counts = await dispatch({ client: createLineClient("test-line-token", fetch409) });

    expect(counts).toEqual(tally({ sent: 1 }));
    expect(headers[0]?.["X-Line-Retry-Key"]).toBe(id);
    expect(await deliveredAt(id)).not.toBeNull();
  });

  it("a throw on one notification holds back that user's later rows for this tick, and the next tick sends them", async () => {
    const linkedAt = new Date();
    await link(SOMCHAI, LINE_A, linkedAt);
    const first = await addNotification(SOMCHAI, new Date(linkedAt.getTime() + 1000));
    const broken = await addNotification(SOMCHAI, new Date(linkedAt.getTime() + 2000));
    const third = await addNotification(SOMCHAI, new Date(linkedAt.getTime() + 3000));

    const flaky: LineClient = {
      reply: line.client.reply,
      push: (to, messages, retryKey) => {
        if (retryKey === broken) return Promise.reject(new Error("simulated network reset"));
        return line.client.push(to, messages, retryKey);
      },
    };
    const log = { warn: vi.fn(), error: vi.fn() };

    // A throw counts as a retry, so the user's rows after it wait for the next tick.
    expect(await dispatch({ client: flaky, log })).toEqual(tally({ sent: 1, retry: 1 }));
    expect(line.sent.map((s) => s.retryKey)).toEqual([first]);
    expect(await deliveredAt(first)).not.toBeNull();
    expect(await deliveredAt(broken)).toBeNull();
    expect(await deliveredAt(third)).toBeNull();
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ notificationId: broken }), expect.any(String));

    expect(await dispatch()).toEqual(tally({ sent: 2 }));
    expect(line.sent.map((s) => s.retryKey)).toEqual([first, broken, third]);
  });

  it("sends at most 10 per user per tick, oldest first", async () => {
    const linkedAt = new Date();
    await link(SOMCHAI, LINE_A, linkedAt);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: SOMCHAI }, select: { id: true } });
    await prisma.notification.createMany({
      data: Array.from({ length: 52 }, (_, i) => ({
        userId: user.id,
        type: "request_submitted" as const,
        message: `${MARK} batch`,
        payload: PAYLOAD,
        createdAt: new Date(linkedAt.getTime() + (i + 1) * 1000),
      })),
    });

    expect(await dispatch()).toEqual(tally({ sent: 10 }));

    const pending = await prisma.notification.findMany({
      where: { message: { startsWith: MARK }, deliveredLineAt: null },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    expect(pending.map((p) => p.createdAt.getTime())).toEqual(
      Array.from({ length: 42 }, (_, i) => linkedAt.getTime() + (i + 11) * 1000),
    );

    expect(await dispatch()).toEqual(tally({ sent: 10 }));
  });

  it("caps a tick at 50 across users, taking the users round-robin", async () => {
    const linkedAt = new Date();
    const staff = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true },
      orderBy: { id: "asc" },
      take: 5,
    });
    const ids = [...staff.map((s) => s.id), await extraUser()];
    expect(ids).toHaveLength(6);
    for (const [i, id] of ids.entries()) {
      await prisma.user.update({ where: { id }, data: { lineUserId: `${CAP_PREFIX}${i}`, lineLinkedAt: linkedAt } });
    }
    await prisma.notification.createMany({
      data: ids.flatMap((userId, u) =>
        Array.from({ length: 10 }, (_, k) => ({
          userId,
          type: "request_submitted" as const,
          message: `${MARK} cap`,
          payload: PAYLOAD,
          createdAt: new Date(linkedAt.getTime() + (k * ids.length + u + 1) * 1000),
        })),
      ),
    });

    expect(await dispatch()).toEqual(tally({ sent: 50 }));
    // 50 over 6 users in turn: eight each, plus one more for the first two in id order.
    const perUser = new Map<string, number>();
    for (const s of line.sent) perUser.set(s.to!, (perUser.get(s.to!) ?? 0) + 1);
    expect([...perUser.values()].sort((a, b) => a - b)).toEqual([8, 8, 8, 8, 9, 9]);

    expect(await dispatch()).toEqual(tally({ sent: 10 }));
  });

  it("does not push a notification older than 24 hours, even one created after the user linked", async () => {
    const now = new Date();
    const linkedAt = new Date(now.getTime() - 3 * DAY_MS);
    await extraUser();
    await prisma.user.update({ where: { email: EXTRA_EMAIL }, data: { lineUserId: LINE_A, lineLinkedAt: linkedAt } });
    const old = await addNotification(EXTRA_EMAIL, new Date(now.getTime() - MAX_AGE_MS - 60_000));
    const recent = await addNotification(EXTRA_EMAIL, new Date(now.getTime() - MAX_AGE_MS + 60_000));

    expect(await dispatch({ now })).toEqual(tally({ sent: 1 }));

    expect(line.sent.map((s) => s.retryKey)).toEqual([recent]);
    expect(await deliveredAt(old)).toBeNull();
    expect(await deliveredAt(recent)).not.toBeNull();
  });

  it("a user whose pushes keep failing does not hold back another user's newer notification", async () => {
    const linkedAt = new Date();
    await link(SOMCHAI, LINE_A, linkedAt);
    await link(ANUCHA, LINE_B, linkedAt);
    for (let i = 0; i < 50; i++) await addNotification(SOMCHAI, new Date(linkedAt.getTime() + (i + 1) * 1000));
    const newer = await addNotification(ANUCHA, new Date(linkedAt.getTime() + 100_000));

    const attempts: string[] = [];
    const failingForA: LineClient = {
      reply: line.client.reply,
      push: (to, messages, retryKey) => {
        if (to !== LINE_A) return line.client.push(to, messages, retryKey);
        attempts.push(to);
        return Promise.resolve({ ok: false, status: 500, permanent: false });
      },
    };

    // Tick 1: A is attempted once, B's notification goes out.
    expect(await dispatch({ client: failingForA })).toEqual(tally({ sent: 1, retry: 1 }));
    expect(await deliveredAt(newer)).not.toBeNull();
    // Ticks 2 and 3: A's oldest row is still due, one attempt per tick.
    expect(await dispatch({ client: failingForA })).toEqual(tally({ retry: 1 }));
    expect(await dispatch({ client: failingForA })).toEqual(tally({ retry: 1 }));
    expect(attempts).toHaveLength(3);
    expect(line.sent.map((s) => s.to)).toEqual([LINE_B]);
  });

  it("takes two users' backlogs round-robin, not all of the older user's first", async () => {
    const linkedAt = new Date();
    await link(SOMCHAI, LINE_A, linkedAt);
    await link(ANUCHA, LINE_B, linkedAt);
    // Somchai's rows are all older than Anucha's, so a global oldest-first order would send all of Somchai's first.
    const somchai: string[] = [];
    const anucha: string[] = [];
    for (const s of [1, 2, 3]) somchai.push(await addNotification(SOMCHAI, new Date(linkedAt.getTime() + s * 1000)));
    for (const s of [11, 12, 13]) anucha.push(await addNotification(ANUCHA, new Date(linkedAt.getTime() + s * 1000)));

    expect(await dispatch()).toEqual(tally({ sent: 6 }));

    // The user order is by id, so whichever of the two has the lower id goes first in each round.
    const somchaiId = (await prisma.user.findUniqueOrThrow({ where: { email: SOMCHAI }, select: { id: true } })).id;
    const anuchaId = (await prisma.user.findUniqueOrThrow({ where: { email: ANUCHA }, select: { id: true } })).id;
    const [firstRows, secondRows] = somchaiId < anuchaId ? [somchai, anucha] : [anucha, somchai];
    expect(line.sent.map((s) => s.retryKey)).toEqual([
      firstRows[0],
      secondRows[0],
      firstRows[1],
      secondRows[1],
      firstRows[2],
      secondRows[2],
    ]);
  });

  it("prunes webhook events older than 7 days and keeps the rest", async () => {
    const old = newEventId();
    const recent = newEventId();
    await prisma.lineWebhookEvent.create({ data: { webhookEventId: old, receivedAt: new Date(Date.now() - 8 * DAY_MS) } });
    await prisma.lineWebhookEvent.create({ data: { webhookEventId: recent, receivedAt: new Date(Date.now() - 6 * DAY_MS) } });

    await dispatch();

    const remaining = await prisma.lineWebhookEvent.findMany({
      where: { webhookEventId: { in: [old, recent] } },
      select: { webhookEventId: true },
    });
    expect(remaining.map((r) => r.webhookEventId)).toEqual([recent]);
  });
});
