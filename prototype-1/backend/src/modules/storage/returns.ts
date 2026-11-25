import { ownedWhere, requireStudentNo, type StorageActor } from "./access.js";
import { storageTx } from "./tx.js";
import { owedInclude, owedView, sortOwed } from "./views.js";
import type { Tx } from "../../db.js";

export async function owedRows(tx: Tx, studentNo: string) {
  return tx.storageOwedItem.findMany({
    where: { request: await ownedWhere(tx, studentNo) },
    include: owedInclude,
    orderBy: [{ createdAt: "asc" }, { serial: { sort: "asc", nulls: "last" } }, { id: "asc" }],
  });
}

export const listMyOwed = (user: StorageActor) =>
  storageTx(async (tx, now) => sortOwed((await owedRows(tx, requireStudentNo(user))).map(owedView), now.getTime()));

/** Counter: owed items of all the student's groups plus their personal requests. */
export const listStudentOwed = (studentNo: string) =>
  storageTx(async (tx, now) => sortOwed((await owedRows(tx, studentNo)).map(owedView), now.getTime()));
