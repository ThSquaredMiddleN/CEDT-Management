import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyLineSignature } from "../../src/modules/line/signature.js";

const SECRET = "fake-channel-secret";
const BODY = Buffer.from('{"destination":"Uxxxxxxxx","events":[]}', "utf8");

const sign = (body: Buffer, secret = SECRET): string =>
  createHmac("sha256", secret).update(body).digest("base64");

describe("verifyLineSignature", () => {
  it("accepts a signature computed over the same raw bytes", () => {
    expect(verifyLineSignature(BODY, sign(BODY), SECRET)).toBe(true);
  });

  it("rejects a signature made with a different secret", () => {
    expect(verifyLineSignature(BODY, sign(BODY, "other-secret"), SECRET)).toBe(false);
  });

  it("rejects a signature of the same length that does not match", () => {
    const good = sign(BODY);
    // Same base64 length (44 chars for a 32-byte digest), last character changed.
    const flipped = good.slice(0, -1) + (good.endsWith("A") ? "B" : "A");
    expect(flipped).toHaveLength(good.length);
    expect(verifyLineSignature(BODY, flipped, SECRET)).toBe(false);
  });

  it("rejects a signature with the wrong length without throwing", () => {
    expect(verifyLineSignature(BODY, sign(BODY).slice(0, 10), SECRET)).toBe(false);
    expect(verifyLineSignature(BODY, `${sign(BODY)}==`, SECRET)).toBe(false);
  });

  it("rejects a body that was changed after signing", () => {
    const tampered = Buffer.from('{"destination":"Uxxxxxxxx","events":[{}]}', "utf8");
    expect(verifyLineSignature(tampered, sign(BODY), SECRET)).toBe(false);
  });

  it("rejects a missing header or an empty secret", () => {
    expect(verifyLineSignature(BODY, undefined, SECRET)).toBe(false);
    expect(verifyLineSignature(BODY, "", SECRET)).toBe(false);
    expect(verifyLineSignature(BODY, sign(BODY), "")).toBe(false);
  });
});
