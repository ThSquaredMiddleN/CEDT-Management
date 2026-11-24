import { Prisma } from "@prisma/client";
import type { Tx } from "../db.js";

export interface AuditInput {
  /** Null when the system did the change, e.g. a retention job. */
  actorId: string | null;
  /** "<module>.<thing>.<verb>", e.g. "storage.request.approved". The module is the first part. */
  action: string;
  /** Kind of thing changed, e.g. "storage_request". */
  subjectType: string;
  /** Id of the thing changed, as text. */
  subjectId: string;
  before?: unknown;
  after?: unknown;
  /** Free text, e.g. a row count for a retention delete. Never the deleted data itself. */
  note?: string | null;
}

const ACTION_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

/** Team plan 2.8: tokens and passwords never reach the audit table. (passwordHash matches "password".) */
function isSecretKey(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    lower.includes("password") ||
    lower.includes("token") ||
    lower.includes("secret") ||
    lower === "apikey" ||
    lower === "api_key"
  );
}

/** Copies the value without secret keys at any depth. Input is plain JSON data, so the caller's object is untouched. */
function stripSecrets(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripSecrets);
  if (node !== null && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(node)) {
      if (!isSecretKey(key)) out[key] = stripSecrets(child);
    }
    return out;
  }
  return node;
}

/** undefined and null become SQL NULL (Prisma.DbNull), not the JSON value null. */
function toJsonColumn(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (value === undefined || value === null) return Prisma.DbNull;
  // Round trip: copies the value, turns Dates into strings, drops functions (JSON.stringify gives undefined for them).
  const json = JSON.stringify(value);
  if (json === undefined) return Prisma.DbNull;
  return stripSecrets(JSON.parse(json)) as Prisma.InputJsonValue;
}

/**
 * Appends one row to audit_logs inside the caller's transaction (tx), so a rolled-back change leaves no audit row.
 * The table is append-only (triggers in the migration): rows are never updated or deleted.
 */
export async function audit(tx: Tx, input: AuditInput): Promise<void> {
  if (!ACTION_PATTERN.test(input.action)) {
    throw new Error(`audit: action "${input.action}" must look like "<module>.<thing>.<verb>"`);
  }
  if (input.subjectType.trim() === "") throw new Error("audit: subjectType must not be empty");
  if (input.subjectId.trim() === "") throw new Error("audit: subjectId must not be empty");

  await tx.auditLog.create({
    data: {
      actorId: input.actorId,
      // The regex above guarantees a "." after the module.
      module: input.action.slice(0, input.action.indexOf(".")),
      action: input.action,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      before: toJsonColumn(input.before),
      after: toJsonColumn(input.after),
      note: input.note ?? null,
    },
  });
}
