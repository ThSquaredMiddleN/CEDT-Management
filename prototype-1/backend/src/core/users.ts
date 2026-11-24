import type { Tx } from "../db.js";

/** The active user whose student number matches, without passwordHash; null if none or inactive. */
export async function findUserByStudentNo(tx: Tx, studentNo: string) {
  return tx.user.findFirst({
    where: { studentNo, isActive: true },
    omit: { passwordHash: true },
  });
}
