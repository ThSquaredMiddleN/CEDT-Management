import { describe, expect, it } from "vitest";
import type { NotifyPayload } from "../../src/modules/bookings/service.js";
import {
  alreadyLinked,
  fallbackTextFor,
  linkFor,
  lineTextFor,
  linkedOk,
  linkPrompt,
} from "../../src/modules/line/messages.js";

const ORIGIN = "https://app.example.test";
const THAI = /[฀-๿]/;
const LATIN = /[A-Za-z]/;
const REQUESTS_URL = `${ORIGIN}/requests`;

const ALL_TYPES = [
  "bookings.request_submitted",
  "bookings.request_approved",
  "bookings.request_rejected",
  "bookings.booking_moved",
  "bookings.booking_cancelled_by_instructor",
  "bookings.request_withdrawn",
];

/** Fake payload: no real course, room, names or IDs. */
const PAYLOAD: NotifyPayload = {
  bookingId: "00000000-0000-4000-8000-000000000001",
  requestNo: "REQ-0001",
  courseCode: "CEDT000",
  roomName: "Room A1",
  date: "2026-11-12",
  dayOfWeek: null,
  startTime: "09:00",
  endTime: "12:00",
  reason: null,
};

/** Splits a message into its blocks: Thai, English, then the link. */
const blocks = (text: string): string[] => text.split("\n\n");

describe("linkFor", () => {
  it("joins the app origin and the row's in-app path", () => {
    expect(linkFor(ORIGIN, "/admin/dashboard")).toBe(`${ORIGIN}/admin/dashboard`);
    expect(linkFor(ORIGIN, "/course-change?view=tracking&request=fake")).toBe(
      `${ORIGIN}/course-change?view=tracking&request=fake`,
    );
  });

  it("sends a null link to the origin's root", () => {
    expect(linkFor(ORIGIN, null)).toBe(`${ORIGIN}/`);
  });
});

describe("fallbackTextFor", () => {
  it("is the message, a blank line, then the link", () => {
    expect(fallbackTextFor("Approved: CEDT000", REQUESTS_URL)).toBe(`Approved: CEDT000\n\n${REQUESTS_URL}`);
  });

  it("clips a long message so the whole text stays within 5000 characters and the link stays whole", () => {
    const text = fallbackTextFor("x".repeat(20_000), REQUESTS_URL);
    expect(text.length).toBeLessThanOrEqual(5000);
    expect(text.endsWith(`\n\n${REQUESTS_URL}`)).toBe(true);
  });
});

describe("lineTextFor", () => {
  it("throws on a payload missing a required field, instead of rendering 'undefined'", () => {
    expect(() => lineTextFor("bookings.request_submitted", {} as NotifyPayload, REQUESTS_URL)).toThrow(TypeError);
    expect(() => lineTextFor("bookings.request_submitted", { ...PAYLOAD, roomName: "" }, REQUESTS_URL)).toThrow(
      TypeError,
    );
  });

  it("throws on a type with no booking title, so the caller falls back to the message", () => {
    expect(() => lineTextFor("course_change.approved", PAYLOAD, REQUESTS_URL)).toThrow(TypeError);
  });

  it.each(ALL_TYPES)("renders %s with Thai first, then English, then the given link", (type) => {
    const text = lineTextFor(type, PAYLOAD, REQUESTS_URL);
    const [th, en, link] = blocks(text);

    expect(th).toMatch(THAI);
    expect(en).toBeDefined();
    expect(en).not.toMatch(THAI);
    expect(en).toMatch(LATIN);
    expect(link).toBe(REQUESTS_URL);
    expect(blocks(text)).toHaveLength(3);
  });

  it("puts the link it is given at the end, whatever the type", () => {
    const url = `${ORIGIN}/admin/dashboard`;
    const [, , link] = blocks(lineTextFor("bookings.request_submitted", PAYLOAD, url));
    expect(link).toBe(url);
  });

  it.each(ALL_TYPES)("keeps %s at most 5000 characters even with a very long reason", (type) => {
    const text = lineTextFor(type, { ...PAYLOAD, reason: "x".repeat(20_000) }, REQUESTS_URL);
    expect(text.length).toBeLessThanOrEqual(5000);
  });

  it("never splits an emoji when clipping a reason at the 500-character limit", () => {
    // 498 plain characters, then an emoji (a surrogate pair at UTF-16 index 498-499), then more text.
    // Code-unit slicing to 499 would keep the high surrogate and drop the low one.
    const reason = `${"a".repeat(498)}😀${"b".repeat(50)}`;
    const text = lineTextFor("bookings.request_rejected", { ...PAYLOAD, reason }, REQUESTS_URL);
    const [, en] = blocks(text);
    expect(en).toContain(`${"a".repeat(498)}😀…`);
    expect(text).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    expect(text).not.toMatch(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
  });

  it("keeps a reason of exactly 500 code points (emoji included) whole", () => {
    // 500 code points but 501 UTF-16 units: a code-unit length check would wrongly clip it.
    const reason = `${"a".repeat(499)}😀`;
    const text = lineTextFor("bookings.request_rejected", { ...PAYLOAD, reason }, REQUESTS_URL);
    const [, en] = blocks(text);
    expect(en).toContain(`Reason: ${reason}`);
    expect(text).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it("shows the reason in both languages when one is given", () => {
    const text = lineTextFor(
      "bookings.request_rejected",
      { ...PAYLOAD, reason: "Room is needed for an exam" },
      REQUESTS_URL,
    );
    const [th, en] = blocks(text);
    expect(th).toContain("Room is needed for an exam");
    expect(en).toContain("Room is needed for an exam");
  });

  it("leaves out the course code when it is null", () => {
    const text = lineTextFor("bookings.booking_moved", { ...PAYLOAD, courseCode: null }, REQUESTS_URL);
    const [, en] = blocks(text);
    expect(en).toContain("Room A1");
    expect(en).not.toContain("null");
    expect(text).not.toContain("null");
    expect(en).not.toMatch(/^ ·/);
  });

  it("shows the weekly day when there is no date (recurring booking)", () => {
    const text = lineTextFor(
      "bookings.booking_cancelled_by_instructor",
      { ...PAYLOAD, date: null, dayOfWeek: 1 },
      REQUESTS_URL,
    );
    const [th, en] = blocks(text);
    expect(en).toContain("every Monday");
    expect(th).toContain("ทุกวันจันทร์");
    expect(text).not.toContain("undefined");
  });

  it("handles a recurring booking with neither date nor weekday", () => {
    const text = lineTextFor("bookings.request_approved", { ...PAYLOAD, date: null, dayOfWeek: null }, REQUESTS_URL);
    expect(text).not.toContain("null");
    expect(text).not.toContain("undefined");
    expect(blocks(text)[1]).toContain("09:00-12:00");
  });

  it("puts the request number in the title", () => {
    const text = lineTextFor("bookings.request_submitted", PAYLOAD, REQUESTS_URL);
    expect(text).toContain("REQ-0001");
  });

  it("covers all six booking types with different titles", () => {
    const titles = ALL_TYPES.map((t) => blocks(lineTextFor(t, PAYLOAD, REQUESTS_URL))[1]?.split("\n")[0]);
    expect(new Set(titles).size).toBe(ALL_TYPES.length);
  });
});

describe("link and status texts", () => {
  it("linkPrompt has Thai first and includes the link once", () => {
    const url = `${ORIGIN}/line/link?token=fake-token-value`;
    const text = linkPrompt(url, 15);
    const [th, en, link] = blocks(text);
    expect(th).toMatch(THAI);
    expect(en).not.toMatch(THAI);
    expect(th).toContain("15 นาที");
    expect(en).toContain("15 minutes");
    expect(th).toContain('พิมพ์ "เชื่อม"');
    expect(en).toContain('type "link"');
    expect(link).toBe(url);
    expect(text.split(url)).toHaveLength(2);
  });

  it("alreadyLinked names the user, Thai first", () => {
    const text = alreadyLinked("Fake Staff");
    const [th, en] = blocks(text);
    expect(th).toContain("Fake Staff");
    expect(th).toMatch(THAI);
    expect(en).toContain("Fake Staff");
    expect(en).not.toMatch(THAI);
  });

  it("linkedOk is Thai first then English", () => {
    const [th, en] = blocks(linkedOk());
    expect(th).toMatch(THAI);
    expect(en).not.toMatch(THAI);
    expect(en).toMatch(LATIN);
  });
});

describe("lineTextFor dates", () => {
  it("shows the Buddhist year in the Thai block and the Gregorian year in the English block", () => {
    const [th, en] = blocks(lineTextFor("bookings.request_approved", PAYLOAD, REQUESTS_URL));
    expect(th).toContain("2569");
    expect(th).not.toContain("2026");
    expect(en).toContain("2026");
    expect(en).not.toContain("2569");
  });
});
