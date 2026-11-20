import { describe, expect, it } from "vitest";
import { sanitizeAnnouncementContent } from "../src/modules/announcements/sanitizer.js";

describe("sanitizeAnnouncementContent", () => {
  it("keeps supported formatting while removing executable markup", () => {
    const result = sanitizeAnnouncementContent(
      '<p style="text-align: center; color: #2563eb">Safe <strong>text</strong></p><script>alert(1)</script><img src="javascript:alert(1)">',
    );

    expect(result).toContain("<strong>text</strong>");
    expect(result).toContain('style="text-align:center;color:#2563eb"');
    expect(result).not.toContain("<script");
    expect(result).not.toContain("javascript:");
    expect(result).not.toContain("alert(1)");
  });

  it("removes unsafe link schemes and preserves safe https links", () => {
    const result = sanitizeAnnouncementContent(
      '<a href="javascript:alert(1)">unsafe</a><a href="https://example.com">safe</a>',
    );

    expect(result).toContain(">unsafe</a>");
    expect(result).toContain('href="https://example.com"');
    expect(result).not.toContain("javascript:");
  });
});
