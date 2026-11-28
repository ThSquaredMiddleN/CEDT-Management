import { access } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "../../src/config.js";
import { saveFile } from "../../src/core/files.js";
import { prisma } from "../../src/db.js";
import { purgeReceiptChecks } from "../../scripts/receipts-purge.js";

/**
 * Made-up students; rows are created directly so their createdAt can be set. Deleted before and after.
 *
 * The purge is global (it deletes every row older than the cutoff), and this database may hold real checks.
 * So the cutoffs are pinned to 2002-01-01 with a `now` argument: only the made-up 2001 rows can be older than it.
 */
const S_OLD = "6500000101";
const S_NEW = "6500000102";
const S_MID = "6500000103"; // older than the file window, younger than the row window
const TERM = "2/2599";
const DAY = 24 * 60 * 60 * 1000;
const CUTOFF = Date.UTC(2002, 0, 1);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]); // made-up bytes

const cleanup = async () => {
  const rows = await prisma.receiptCheck.findMany({
    where: { studentId: { in: [S_OLD, S_NEW, S_MID] } },
    select: { id: true, fileId: true },
  });
  await prisma.receiptCheck.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
  await prisma.file.deleteMany({ where: { id: { in: rows.flatMap((r) => (r.fileId ? [r.fileId] : [])) } } });
};

const exists = (storageKey: string) =>
  access(path.resolve(config.FILE_STORAGE_DIR, ...storageKey.split("/"))).then(
    () => true,
    () => false,
  );

let adminId: string;
const keys: Record<string, string> = {};

async function addRow(studentId: string, createdAt: Date, withFile: boolean) {
  let fileId: string | null = null;
  if (withFile) {
    const saved = await saveFile(prisma, {
      buffer: JPEG,
      mime: "image/jpeg",
      originalName: "receipt-test.jpg",
      module: "receipts",
      uploadedBy: adminId,
    });
    fileId = saved.id;
    keys[studentId] = saved.storageKey;
  }
  await prisma.receiptCheck.create({
    data: {
      studentId,
      term: TERM,
      kind: "pdf",
      checks: [],
      verdict: "warn",
      checkedById: adminId,
      createdAt,
      fileId,
      ocrName: withFile ? "made-up name" : null,
    },
  });
}

beforeAll(async () => {
  await cleanup();
  adminId = (await prisma.user.findUniqueOrThrow({ where: { email: "admin@cedt.edu" } })).id;
  await addRow(S_OLD, new Date(Date.UTC(2001, 5, 1)), true);
  await addRow(S_MID, new Date(Date.UTC(2001, 11, 1)), true);
  await addRow(S_NEW, new Date(Date.now() - DAY), true);
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("purgeReceiptChecks", () => {
  it("deletes only the rows older than the cutoff, with their files", async () => {
    // retentionDays of 365 with `now` one year after the cutoff puts the cutoff exactly on 2002-01-01.
    const now = new Date(CUTOFF + 365 * DAY);
    const result = await purgeReceiptChecks({ retentionDays: 365, fileDays: 100_000, now });
    // S_MID is also older than the row cutoff, so it goes too: the two made-up 2001 rows.
    expect(result).toEqual({ deleted: 2, filesCleared: 0 });
    expect(await prisma.receiptCheck.count({ where: { studentId: { in: [S_OLD, S_MID] } } })).toBe(0);
    expect(await prisma.receiptCheck.count({ where: { studentId: S_NEW } })).toBe(1);
    expect(await prisma.file.count({ where: { storageKey: { in: [keys[S_OLD]!, keys[S_MID]!] } } })).toBe(0);
    expect(await exists(keys[S_OLD]!)).toBe(false);
    expect(await exists(keys[S_MID]!)).toBe(false);
    expect(await exists(keys[S_NEW]!)).toBe(true);
  });

  it("clears the file and the OCR'd name of rows past the file window but keeps the row", async () => {
    await addRow(S_MID, new Date(Date.UTC(2001, 11, 1)), true);
    const now = new Date(CUTOFF + 365 * DAY);
    const result = await purgeReceiptChecks({ retentionDays: 100_000, fileDays: 365, now });
    expect(result).toEqual({ deleted: 0, filesCleared: 1 });
    const mid = await prisma.receiptCheck.findFirstOrThrow({ where: { studentId: S_MID } });
    expect(mid).toMatchObject({ fileId: null, ocrName: null, verdict: "warn" });
    expect(await exists(keys[S_MID]!)).toBe(false);
    expect(await prisma.file.count({ where: { storageKey: keys[S_MID]! } })).toBe(0);

    const fresh = await prisma.receiptCheck.findFirstOrThrow({ where: { studentId: S_NEW } });
    expect(fresh.fileId).not.toBeNull();
    expect(fresh.ocrName).toBe("made-up name");
    expect(await exists(keys[S_NEW]!)).toBe(true);
  });

  it("a row whose file row is already gone is still deleted, and the other rows' files are removed", async () => {
    await cleanup(); // start from no made-up rows, so the counts below are exact
    await addRow(S_OLD, new Date(Date.UTC(2001, 5, 1)), true);
    await addRow(S_MID, new Date(Date.UTC(2001, 11, 1)), true);
    await prisma.file.deleteMany({ where: { storageKey: keys[S_OLD]! } }); // the check still points at it
    const now = new Date(CUTOFF + 365 * DAY);
    const result = await purgeReceiptChecks({ retentionDays: 365, fileDays: 100_000, now });
    expect(result).toEqual({ deleted: 2, filesCleared: 0 });
    expect(await prisma.receiptCheck.count({ where: { studentId: { in: [S_OLD, S_MID] } } })).toBe(0);
    expect(await exists(keys[S_MID]!)).toBe(false);
  });
});
