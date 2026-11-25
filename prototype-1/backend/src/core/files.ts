import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma, type Tx } from "../db.js";
import { notFound } from "../lib/errors.js";
import { fileStore, newStorageKey } from "./file-store.js";

const MODULE = /^[a-z][a-z0-9_]*$/;
/** Uploading to Supabase happens inside the transaction; Prisma's default 5 s is too short for 10 MB. */
const FILE_TX_TIMEOUT_MS = 30_000;

export interface SaveFileInput {
  buffer: Buffer;
  mime: string;
  /** Shown to users and used as the download name. Never part of the storage key. */
  originalName: string;
  /** The owning module, e.g. "course_change", "news". */
  module: string;
  uploadedBy: string | null;
}

export interface SavedFile {
  id: string;
  storageKey: string;
  size: number;
  sha256: string;
}

/**
 * Uploads the contents, then writes the `files` row with tx. If the row fails, the contents are removed.
 * If the caller's transaction rolls back later, the contents stay until scripts/files-sweep.ts removes
 * them; use withFileTransaction() to remove them at once instead.
 */
export async function saveFile(tx: Tx, input: SaveFileInput): Promise<SavedFile> {
  if (input.buffer.length === 0) throw new Error("saveFile: file is empty");
  if (!MODULE.test(input.module)) throw new Error(`saveFile: module "${input.module}" must be snake_case`);
  const storageKey = newStorageKey();
  const sha256 = createHash("sha256").update(input.buffer).digest("hex");
  await fileStore.put(storageKey, input.buffer, input.mime);
  try {
    const row = await tx.file.create({
      data: {
        storageKey,
        originalName: input.originalName,
        mime: input.mime,
        size: input.buffer.length,
        sha256,
        module: input.module,
        uploadedById: input.uploadedBy,
      },
      select: { id: true },
    });
    return { id: row.id, storageKey, size: input.buffer.length, sha256 };
  } catch (e) {
    await fileStore.remove(storageKey).catch(() => undefined);
    throw e;
  }
}

export interface FileWriter {
  save(input: SaveFileInput): Promise<SavedFile>;
}

/**
 * Runs fn in one transaction. Files saved through `files.save` are removed from fileStore if the
 * transaction rolls back (shared plan 2.9: upload first, write the row, delete the file on failure).
 */
export async function withFileTransaction<T>(
  fn: (tx: Tx, files: FileWriter) => Promise<T>,
  options: { timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel } = {},
): Promise<T> {
  const written: string[] = [];
  try {
    return await prisma.$transaction(
      (tx) =>
        fn(tx, {
          save: async (input) => {
            const saved = await saveFile(tx, input);
            written.push(saved.storageKey);
            return saved;
          },
        }),
      { timeout: options.timeout ?? FILE_TX_TIMEOUT_MS, isolationLevel: options.isolationLevel },
    );
  } catch (e) {
    await Promise.allSettled(written.map((key) => fileStore.remove(key)));
    throw e;
  }
}

export interface StoredFile {
  buffer: Buffer;
  mime: string;
  originalName: string;
  size: number;
  sha256: string;
}

/** The contents and metadata of a file. Callers check permissions first (downloads go through modules). */
export async function readFile(fileId: string, db: Tx = prisma): Promise<StoredFile> {
  const row = await db.file.findUnique({ where: { id: fileId } });
  if (!row) throw notFound("ไม่พบไฟล์");
  const buffer = await fileStore.get(row.storageKey);
  return { buffer, mime: row.mime, originalName: row.originalName, size: row.size, sha256: row.sha256 };
}

/**
 * Deletes the `files` row inside tx and returns its storage key. Remove the contents with
 * removeStoredFile() AFTER the transaction commits, so a rollback never loses contents.
 */
export async function deleteFileRecord(tx: Tx, fileId: string): Promise<string> {
  const row = await tx.file.delete({ where: { id: fileId }, select: { storageKey: true } });
  return row.storageKey;
}

/** Best effort: a failure leaves an orphan that scripts/files-sweep.ts removes later. */
export async function removeStoredFile(storageKey: string): Promise<void> {
  await fileStore.remove(storageKey);
}
