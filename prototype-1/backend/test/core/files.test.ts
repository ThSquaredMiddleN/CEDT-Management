import { createHash } from "node:crypto";
import { utimes } from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { sweepOrphanFiles } from "../../scripts/files-sweep.js";
import { config } from "../../src/config.js";
import { fileStore, newStorageKey } from "../../src/core/file-store.js";
import { deleteFileRecord, readFile, removeStoredFile, saveFile, withFileTransaction } from "../../src/core/files.js";
import { prisma } from "../../src/db.js";
import { idOf } from "../helpers/session.js";

afterAll(async () => {
  await prisma.$disconnect();
});

const input = (text: string, uploadedBy: string | null = null) => ({
  buffer: Buffer.from(text),
  mime: "text/plain",
  originalName: "note.txt",
  module: "course_change",
  uploadedBy,
});

describe("saveFile and readFile", () => {
  it("stores the contents in fileStore and the metadata in files", async () => {
    const staff = await idOf(prisma, "staff@test.local");
    const saved = await prisma.$transaction((tx) => saveFile(tx, input("hello", staff)));
    const row = await prisma.file.findUniqueOrThrow({ where: { id: saved.id } });
    expect(row).toMatchObject({
      originalName: "note.txt",
      mime: "text/plain",
      size: 5,
      module: "course_change",
      uploadedById: staff,
      sha256: createHash("sha256").update("hello").digest("hex"),
    });
    expect(row.storageKey).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}$/);
    const read = await readFile(saved.id);
    expect(read.buffer.toString()).toBe("hello");
    expect(read).toMatchObject({ mime: "text/plain", originalName: "note.txt", size: 5 });
  });

  it("rejects an empty file and a bad module name", async () => {
    await expect(prisma.$transaction((tx) => saveFile(tx, input("")))).rejects.toThrow(/empty/);
    await expect(prisma.$transaction((tx) => saveFile(tx, { ...input("x"), module: "Bad Module" }))).rejects.toThrow(
      /module/,
    );
  });

  it("readFile of an unknown id is NOT_FOUND", async () => {
    await expect(readFile("00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("withFileTransaction", () => {
  it("removes uploaded contents when the transaction rolls back", async () => {
    let key = "";
    await expect(
      withFileTransaction(async (_tx, files) => {
        key = (await files.save(input("rollback me"))).storageKey;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(key).not.toBe("");
    expect(await prisma.file.count({ where: { storageKey: key } })).toBe(0);
    await expect(fileStore.get(key)).rejects.toThrow();
  });

  it("keeps contents and rows when it commits", async () => {
    const saved = await withFileTransaction((_tx, files) => files.save(input("keep me")));
    expect((await fileStore.get(saved.storageKey)).toString()).toBe("keep me");
  });
});

describe("deleteFileRecord and removeStoredFile", () => {
  it("deletes the row in the transaction, then the contents after commit", async () => {
    const saved = await withFileTransaction((_tx, files) => files.save(input("bye")));
    const key = await prisma.$transaction((tx) => deleteFileRecord(tx, saved.id));
    expect(key).toBe(saved.storageKey);
    expect(await prisma.file.count({ where: { id: saved.id } })).toBe(0);
    await removeStoredFile(key);
    await expect(fileStore.get(key)).rejects.toThrow();
  });
});

describe("sweepOrphanFiles", () => {
  it("removes old contents with no row, keeps fresh orphans and anything with a row", async () => {
    const now = new Date();
    const oldOrphan = newStorageKey(now);
    const freshOrphan = newStorageKey(now);
    await fileStore.put(oldOrphan, Buffer.from("old"), "text/plain");
    await fileStore.put(freshOrphan, Buffer.from("fresh"), "text/plain");
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    await utimes(path.resolve(config.FILE_STORAGE_DIR, ...oldOrphan.split("/")), twoDaysAgo, twoDaysAgo);
    const kept = await withFileTransaction((_tx, files) => files.save(input("has a row")));
    await utimes(path.resolve(config.FILE_STORAGE_DIR, ...kept.storageKey.split("/")), twoDaysAgo, twoDaysAgo);

    const removed = await sweepOrphanFiles({ now, months: 1 });

    expect(removed).toContain(oldOrphan);
    await expect(fileStore.get(oldOrphan)).rejects.toThrow();
    expect((await fileStore.get(freshOrphan)).toString()).toBe("fresh");
    expect((await fileStore.get(kept.storageKey)).toString()).toBe("has a row");
  });
});
