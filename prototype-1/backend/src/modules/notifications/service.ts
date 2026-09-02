import type { NotificationType } from "@prisma/client";
import type { Tx } from "../../db.js";

export interface NotifyPayload {
  bookingId: string;
  requestNo: string;
  courseCode: string | null;
  roomName: string;
  date?: string | null;
  dayOfWeek?: number | null;
  startTime: string;
  endTime: string;
  reason?: string | null;
}

/**
 * BR-15: notifications are written INSIDE the transaction of the status change they
 * announce, so a rolled-back approval can never leave a ghost "Approved" notification.
 */
export async function notify(
  tx: Tx,
  args: {
    userIds: string[];
    type: NotificationType;
    message: string;
    bookingId: string;
    payload: NotifyPayload;
  },
): Promise<void> {
  const recipients = [...new Set(args.userIds)];
  if (recipients.length === 0) return;

  await tx.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      type: args.type,
      message: args.message,
      bookingId: args.bookingId,
      payload: args.payload as unknown as object,
    })),
  });
}

/** All active staff — the recipient set for submit/withdraw/cancel notifications. */
export async function activeAdminIds(tx: Tx): Promise<string[]> {
  const staff = await tx.user.findMany({
    where: { role: "staff", isActive: true },
    select: { id: true },
  });
  return staff.map((a) => a.id);
}
