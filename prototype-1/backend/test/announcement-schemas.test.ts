import { describe, expect, it } from "vitest";
import { announcementCreateSchema } from "../src/modules/announcements/schemas.js";

const validAnnouncement = {
  title: "Registration notice",
  content: "<p>Details</p>",
  audiences: ["year3"],
};

describe("announcementCreateSchema", () => {
  it("accepts a title, rich text content and a target audience", () => {
    expect(announcementCreateSchema.safeParse(validAnnouncement).success).toBe(true);
  });

  it("rejects empty or repeated audience selections", () => {
    expect(
      announcementCreateSchema.safeParse({ ...validAnnouncement, audiences: [] }).success,
    ).toBe(false);
    expect(
      announcementCreateSchema.safeParse({
        ...validAnnouncement,
        audiences: ["year3", "year3"],
      }).success,
    ).toBe(false);
  });
});
