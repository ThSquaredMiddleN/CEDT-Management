import type { Prisma } from "@prisma/client";
import type { Tx } from "../db.js";

export interface NotifyInput {
  userIds: string[];
  /** "<module>.<event>", e.g. "bookings.request_approved". Must start with `module + "."`. */
  type: string;
  module: string;
  /** Id of the thing notified about, as text. */
  subjectId?: string | null;
  /** Readable without opening the web app; LINE sends this text as-is. */
  message: string;
  /** In-app path such as "/requests". Never a full URL. */
  link?: string | null;
  payload?: Prisma.InputJsonValue;
  /** false keeps this notice in-app only; default true sends it to LINE too. */
  line?: boolean;
}

/**
 * Writes one notification row per distinct recipient, inside the caller's transaction (tx), so a rolled-back
 * status change never leaves a notification behind. Returns the number of rows written (0 for an empty list).
 */
export async function notify(tx: Tx, input: NotifyInput): Promise<number> {
  if (!input.type.startsWith(`${input.module}.`)) {
    throw new Error(`notify: type "${input.type}" must start with "${input.module}."`);
  }
  // "//host" and "/\host" are protocol-relative URLs in browsers, not in-app paths; whitespace never belongs in one.
  if (input.link != null && (!input.link.startsWith("/") || /^\/[/\\]/.test(input.link) || /\s/.test(input.link))) {
    throw new Error(`notify: link "${input.link}" must be an in-app path starting with "/"`);
  }
  if (input.message.trim() === "") {
    throw new Error("notify: message must not be empty");
  }

  const recipients = [...new Set(input.userIds)];
  if (recipients.length === 0) return 0;

  const result = await tx.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      type: input.type,
      module: input.module,
      subjectId: input.subjectId ?? null,
      message: input.message,
      link: input.link ?? null,
      payload: input.payload ?? {},
      sendLine: input.line ?? true,
    })),
  });
  return result.count;
}
