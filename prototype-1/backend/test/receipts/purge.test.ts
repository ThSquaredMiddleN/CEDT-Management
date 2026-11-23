import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/db.js";
import { purgeReceiptChecks } from "../../scripts/receipts-purge.js";

/**
 * Made-up students; rows are created directly so their createdAt can be set. Deleted before and after.
 *
 * The purge is global (it deletes every row older than the cutoff), and this database may hold real checks.
 * So the cutoff is pinned to 2002-01-01 with a `now` argument: only the made-up 2001 row can be older than it.
 */
const S_OLD = "6500000101";
const S_NEW = "6500000102";
const TERM = "2/2599";
const DAY = 24 * 60 * 60 * 1000;
const CUTOFF = Date.UTC(2002, 0, 1);

const cleanup = () => prisma.receiptCheck.deleteMany({ where: { studentId: { in: [S_OLD, S_NEW] } } });

beforeAll(async () => {
  await cleanup();
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@cedt.edu" } });
  const base = { term: TERM, kind: "pdf", checks: [], verdict: "ok", checkedById: admin.id };
  await prisma.receiptCheck.create({
    data: { ...base, studentId: S_OLD, createdAt: new Date(Date.UTC(2001, 5, 1)) },
  });
  await prisma.receiptCheck.create({
    data: { ...base, studentId: S_NEW, createdAt: new Date(Date.now() - DAY) },
  });
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("purgeReceiptChecks", () => {
  it("deletes only the rows older than the cutoff", async () => {
    // retentionDays of 365 with `now` one year after the cutoff puts the cutoff exactly on 2002-01-01.
    const now = new Date(CUTOFF + 365 * DAY);
    const deleted = await purgeReceiptChecks({ retentionDays: 365, now });
    expect(deleted).toBe(1);
    expect(await prisma.receiptCheck.count({ where: { studentId: S_OLD } })).toBe(0);
    expect(await prisma.receiptCheck.count({ where: { studentId: S_NEW } })).toBe(1);
  });
});
