import type { Tx } from "../db.js";

/** The active user whose student number matches, without passwordHash; null if none or inactive. */
export async function findUserByStudentNo(tx: Tx, studentNo: string) {
  return tx.user.findFirst({
    where: { studentNo, isActive: true },
    omit: { passwordHash: true },
  });
}

/** All active staff: the recipient set for submit/withdraw/cancel notifications. */
export async function activeAdminIds(tx: Tx): Promise<string[]> {
  const staff = await tx.user.findMany({
    where: { role: "staff", isActive: true },
    select: { id: true },
  });
  return staff.map((a) => a.id);
}
