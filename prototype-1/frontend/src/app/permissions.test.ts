import { describe, expect, it } from "vitest";
import { can, isStaff } from "./permissions";

describe("can", () => {
  it("matches exactly and handles a signed-out user", () => {
    expect(can({ permissions: ["news.manage"] }, "news.manage")).toBe(true);
    expect(can({ permissions: ["news.manage"] }, "news.view")).toBe(false);
    expect(can(null, "news.view")).toBe(false);
  });
});

describe("isStaff", () => {
  it("is true with any .view permission (opens /admin)", () => {
    expect(isStaff({ permissions: ["course_change.use", "receipts.view"] })).toBe(true);
    expect(isStaff({ permissions: ["course_change.use", "bookings.use"] })).toBe(false);
    expect(isStaff(null)).toBe(false);
  });
});
