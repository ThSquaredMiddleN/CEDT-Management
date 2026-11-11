import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * LINE signs the raw request body: base64(HMAC-SHA256(channel secret, body bytes)), sent in the
 * `x-line-signature` header. Verify over the Buffer as received, never over re-serialized JSON.
 */
export function verifyLineSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  channelSecret: string,
): boolean {
  if (!signatureHeader || !channelSecret) return false;
  const expected = Buffer.from(createHmac("sha256", channelSecret).update(rawBody).digest("base64"), "utf8");
  const given = Buffer.from(signatureHeader, "utf8");
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}
