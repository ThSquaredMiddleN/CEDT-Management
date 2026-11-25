import { audit } from "../../core/audit.js";
import type { Tx } from "../../db.js";
import { validation } from "../../lib/errors.js";
import { storageTx } from "./tx.js";

export async function readDefaultDueAt(tx: Tx): Promise<Date> {
  const row = await tx.storageSetting.findUnique({ where: { id: 1 } });
  if (!row) throw new Error("storage_settings row is missing (it is inserted by the storage migration)");
  return row.defaultDueAt;
}

export const getSettings = () => storageTx(async (tx) => ({ defaultDueAt: (await readDefaultDueAt(tx)).getTime() }));

/** Applies to future pickups only. */
export function setDefaultDue(actorId: string, at: number) {
  return storageTx(async (tx, now) => {
    if (!Number.isFinite(at) || at <= now.getTime()) throw validation("กำหนดคืนต้องเป็นเวลาในอนาคต");
    const before = await readDefaultDueAt(tx);
    await tx.storageSetting.update({ where: { id: 1 }, data: { defaultDueAt: new Date(at) } });
    await audit(tx, {
      actorId,
      action: "storage.settings.due_changed",
      subjectType: "storage_settings",
      subjectId: "1",
      before: { defaultDueAt: before.toISOString() },
      after: { defaultDueAt: new Date(at).toISOString() },
    });
    return { defaultDueAt: at };
  });
}
