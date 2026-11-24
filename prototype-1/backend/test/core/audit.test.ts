import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/db.js";
import { audit } from "../../src/core/audit.js";

/**
 * audit_logs cannot be deleted, so every test uses its own random subject id and nothing is cleaned up.
 * The actor is a seeded staff account (never deleted by these tests): audit_logs.actor_id restricts user deletes.
 */
let staffId = "";

beforeAll(async () => {
  const staff = await prisma.user.findFirstOrThrow({ where: { role: "staff" }, select: { id: true } });
  staffId = staff.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("audit", () => {
  it("writes one row with module taken from the action", async () => {
    const subjectId = randomUUID();
    await audit(prisma, {
      actorId: staffId,
      action: "storage.request.approved",
      subjectType: "storage_request",
      subjectId,
      after: { status: "approved" },
      note: "checked by test",
    });

    expect(await prisma.auditLog.count({ where: { subjectId } })).toBe(1);
    const row = await prisma.auditLog.findFirstOrThrow({ where: { subjectId } });
    expect(typeof row.id).toBe("bigint");
    expect(row.actorId).toBe(staffId);
    expect(row.module).toBe("storage");
    expect(row.action).toBe("storage.request.approved");
    expect(row.subjectType).toBe("storage_request");
    expect(row.after).toEqual({ status: "approved" });
    expect(row.note).toBe("checked by test");
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it("allows a null actor and stores undefined before / after as SQL NULL", async () => {
    const subjectId = randomUUID();
    await audit(prisma, {
      actorId: null,
      action: "receipts.retention.purged",
      subjectType: "receipt_check",
      subjectId,
      note: "removed 3 rows",
    });

    const row = await prisma.auditLog.findFirstOrThrow({ where: { subjectId } });
    expect(row.actorId).toBeNull();
    expect(row.module).toBe("receipts");
    expect(row.note).toBe("removed 3 rows");
    const [nulls] = await prisma.$queryRaw<{ before_null: boolean; after_null: boolean }[]>`
      SELECT before IS NULL AS before_null, after IS NULL AS after_null FROM audit_logs WHERE subject_id = ${subjectId}`;
    expect(nulls).toEqual({ before_null: true, after_null: true });
  });

  it("removes secret keys at any depth, including inside arrays, and leaves the caller's object unchanged", async () => {
    const subjectId = randomUUID();
    const before = {
      name: "keep me",
      password: "not-for-storage",
      nested: { apiKey: "not-for-storage", deeper: { Token: "not-for-storage", ok: 1 } },
      list: [{ client_secret: "not-for-storage", keep: true }, "plain"],
      passwordHash: "not-for-storage",
      api_key: "not-for-storage",
    };
    const snapshot = structuredClone(before);

    await audit(prisma, {
      actorId: null,
      action: "auth.session.created",
      subjectType: "session",
      subjectId,
      before,
      after: before,
    });

    expect(before).toEqual(snapshot);
    const expected = { name: "keep me", nested: { deeper: { ok: 1 } }, list: [{ keep: true }, "plain"] };
    const row = await prisma.auditLog.findFirstOrThrow({ where: { subjectId } });
    expect(row.before).toEqual(expected);
    expect(row.after).toEqual(expected);
    expect(JSON.stringify([row.before, row.after])).not.toContain("not-for-storage");
  });

  it("rejects an action that does not have three lowercase parts, and writes nothing", async () => {
    for (const action of ["storage.approved", "Storage.request.approved"]) {
      const subjectId = randomUUID();
      await expect(
        audit(prisma, { actorId: null, action, subjectType: "storage_request", subjectId }),
      ).rejects.toThrow(/must look like "<module>\.<thing>\.<verb>"/);
      expect(await prisma.auditLog.count({ where: { subjectId } })).toBe(0);
    }
  });

  it("rejects an empty subjectType or subjectId, and writes nothing", async () => {
    const subjectId = randomUUID();
    await expect(
      audit(prisma, { actorId: null, action: "storage.request.approved", subjectType: "storage_request", subjectId: " " }),
    ).rejects.toThrow(/subjectId must not be empty/);
    await expect(
      audit(prisma, { actorId: null, action: "storage.request.approved", subjectType: "", subjectId }),
    ).rejects.toThrow(/subjectType must not be empty/);
    expect(await prisma.auditLog.count({ where: { subjectId } })).toBe(0);
  });

  it("refuses UPDATE, DELETE and TRUNCATE on audit_logs", async () => {
    const subjectId = randomUUID();
    await audit(prisma, {
      actorId: null,
      action: "bookings.request.created",
      subjectType: "booking_request",
      subjectId,
      note: "original",
    });

    await expect(
      prisma.$executeRawUnsafe(`UPDATE audit_logs SET note = 'changed' WHERE subject_id = $1`, subjectId),
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM audit_logs WHERE subject_id = $1`, subjectId),
    ).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRawUnsafe(`TRUNCATE audit_logs`)).rejects.toThrow(/append-only/);

    const row = await prisma.auditLog.findFirstOrThrow({ where: { subjectId } });
    expect(row.note).toBe("original");
  });
});
