import { describe, expect, it } from "vitest";
import { can, isStaff, roleLanding } from "./permissions";

describe("roleLanding", () => {
  it("sends anyone with a .view permission to /admin and everyone else to /", () => {
    expect(roleLanding({ permissions: ["announcements.view", "announcements.manage"] })).toBe("/admin");
    expect(roleLanding({ permissions: ["core.users.view", "core.permissions.manage"] })).toBe("/admin");
    expect(roleLanding({ permissions: ["course_change.use", "line.use"] })).toBe("/");
    expect(roleLanding({ permissions: [] })).toBe("/");
    expect(roleLanding(null)).toBe("/");
  });
});

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
