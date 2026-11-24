import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/db.js";
import { notify } from "../../src/core/notify.js";

/** Made-up staff users, unique per run, created here and deleted afterwards. */
const RUN = randomUUID();
const EMAIL_A = `core-notify-a-${RUN}@example.test`;
const EMAIL_B = `core-notify-b-${RUN}@example.test`;
const EMAILS = [EMAIL_A, EMAIL_B];

let userA = "";
let userB = "";

async function cleanup(): Promise<void> {
  const users = await prisma.user.findMany({ where: { email: { in: EMAILS } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  // Notifications restrict user deletes, so they go first.
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
}

beforeAll(async () => {
  await cleanup();
  const a = await prisma.user.create({
    data: { email: EMAIL_A, name: "Made-up notify user A", role: "staff" },
  });
  const b = await prisma.user.create({
    data: { email: EMAIL_B, name: "Made-up notify user B", role: "staff" },
  });
  userA = a.id;
  userB = b.id;
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("notify", () => {
  it("writes one row per distinct user, with module, subjectId and link set", async () => {
    const subjectId = randomUUID();
    const count = await notify(prisma, {
      userIds: [userA, userB, userA],
      type: "bookings.request_approved",
      module: "bookings",
      subjectId,
      message: "Your request was approved",
      link: "/requests",
      payload: { requestNo: "R-1" },
    });

    expect(count).toBe(2);
    const rows = await prisma.notification.findMany({ where: { subjectId } });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.userId).sort()).toEqual([userA, userB].sort());
    for (const row of rows) {
      expect(row.type).toBe("bookings.request_approved");
      expect(row.module).toBe("bookings");
      expect(row.subjectId).toBe(subjectId);
      expect(row.message).toBe("Your request was approved");
      expect(row.link).toBe("/requests");
      expect(row.payload).toEqual({ requestNo: "R-1" });
      expect(row.isRead).toBe(false);
      expect(row.readAt).toBeNull();
    }
  });

  it("stores null subjectId and link when they are omitted", async () => {
    const message = `no subject ${randomUUID()}`;
    await notify(prisma, { userIds: [userA], type: "course_change.submitted", module: "course_change", message });

    const row = await prisma.notification.findFirstOrThrow({ where: { userId: userA, message } });
    expect(row.subjectId).toBeNull();
    expect(row.link).toBeNull();
    expect(row.payload).toEqual({});
  });

  it("rejects a type that does not start with the module prefix, and writes nothing", async () => {
    const subjectId = randomUUID();
    await expect(
      notify(prisma, {
        userIds: [userA],
        type: "course_change.submitted",
        module: "bookings",
        subjectId,
        message: "wrong prefix",
      }),
    ).rejects.toThrow(/must start with "bookings\."/);
    expect(await prisma.notification.count({ where: { subjectId } })).toBe(0);
  });

  it("rejects a full URL as link, and writes nothing", async () => {
    const subjectId = randomUUID();
    await expect(
      notify(prisma, {
        userIds: [userA],
        type: "bookings.request_submitted",
        module: "bookings",
        subjectId,
        message: "full url",
        link: "https://example.test/requests",
      }),
    ).rejects.toThrow(/must be an in-app path/);
    expect(await prisma.notification.count({ where: { subjectId } })).toBe(0);
  });

  it("rejects protocol-relative links (//host and /\\host) and links with whitespace, and writes nothing", async () => {
    for (const link of ["//evil.example/requests", "/\\evil.example/requests", "/requests\nhttps://evil.example", "/a b"]) {
      const subjectId = randomUUID();
      await expect(
        notify(prisma, {
          userIds: [userA],
          type: "bookings.request_submitted",
          module: "bookings",
          subjectId,
          message: "protocol-relative link",
          link,
        }),
      ).rejects.toThrow(/must be an in-app path/);
      expect(await prisma.notification.count({ where: { subjectId } })).toBe(0);
    }
  });

  it("rejects an empty message", async () => {
    await expect(
      notify(prisma, { userIds: [userA], type: "bookings.request_submitted", module: "bookings", message: "  " }),
    ).rejects.toThrow(/must not be empty/);
  });

  it("is a no-op for an empty recipient list", async () => {
    const subjectId = randomUUID();
    const count = await notify(prisma, {
      userIds: [],
      type: "bookings.request_submitted",
      module: "bookings",
      subjectId,
      message: "nobody to tell",
    });
    expect(count).toBe(0);
    expect(await prisma.notification.count({ where: { subjectId } })).toBe(0);
  });
});
