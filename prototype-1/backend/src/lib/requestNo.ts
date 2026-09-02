import type { Tx } from "../db.js";

/** LS-<year>-<5-digit sequence>, generated inside the create transaction (§3.3). */
export async function nextRequestNo(tx: Tx): Promise<string> {
  const rows = await tx.$queryRaw<{ request_no: string }[]>`
    SELECT 'LS-' || EXTRACT(year FROM now() AT TIME ZONE 'Asia/Bangkok')::int
           || '-' || lpad(nextval('booking_request_seq')::text, 5, '0') AS request_no
  `;
  return rows[0]!.request_no;
}
