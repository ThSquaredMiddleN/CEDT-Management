import { describe, expect, it } from "vitest";
import { isDevelopmentAdminBypassEnabled } from "../src/lib/auth-policy.js";

describe("development admin bypass policy", () => {
  it("allows explicit bypass requests only in development", () => {
    expect(isDevelopmentAdminBypassEnabled("development", true)).toBe(true);
    expect(isDevelopmentAdminBypassEnabled("test", true)).toBe(false);
    expect(isDevelopmentAdminBypassEnabled("production", true)).toBe(false);
  });

  it("requires an explicit bypass request", () => {
    expect(isDevelopmentAdminBypassEnabled("development", false)).toBe(false);
  });
});
