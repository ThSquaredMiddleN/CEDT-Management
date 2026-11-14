import type { NotificationType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { NotifyPayload } from "../../src/modules/notifications/service.js";
import { alreadyLinked, lineTextFor, linkedOk, linkPrompt } from "../../src/modules/line/messages.js";

const ORIGIN = "https://app.example.test";
const THAI = /[฀-๿]/;
const LATIN = /[A-Za-z]/;

const ALL_TYPES: NotificationType[] = [
  "request_submitted",
  "request_approved",
  "request_rejected",
  "booking_moved",
  "booking_cancelled_by_instructor",
  "request_withdrawn",
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

describe("lineTextFor", () => {
  it("throws on a payload missing a required field, instead of rendering 'undefined'", () => {
    expect(() => lineTextFor("request_submitted", {} as NotifyPayload, ORIGIN)).toThrow(TypeError);
    expect(() => lineTextFor("request_submitted", { ...PAYLOAD, roomName: "" }, ORIGIN)).toThrow(TypeError);
  });

  it.each(ALL_TYPES)("renders %s with Thai first, then English, then the link", (type) => {
    const text = lineTextFor(type, PAYLOAD, ORIGIN);
    const [th, en, link] = blocks(text);

    expect(th).toMatch(THAI);
    expect(en).toBeDefined();
    expect(en).not.toMatch(THAI);
    expect(en).toMatch(LATIN);
    expect(link).toBe(`${ORIGIN}${type === "request_submitted" ? "/admin/dashboard" : "/requests"}`);
    expect(blocks(text)).toHaveLength(3);
  });

  it("links request_submitted to the approvers' dashboard, not to the reader's own requests", () => {
    const [, , link] = blocks(lineTextFor("request_submitted", PAYLOAD, ORIGIN));
    expect(link).toBe(`${ORIGIN}/admin/dashboard`);
    expect(link).not.toBe(`${ORIGIN}/requests`);
  });

  it.each(ALL_TYPES)("keeps %s at most 5000 characters even with a very long reason", (type) => {
    const text = lineTextFor(type, { ...PAYLOAD, reason: "x".repeat(20_000) }, ORIGIN);
    expect(text.length).toBeLessThanOrEqual(5000);
  });

  it("never splits an emoji when clipping a reason at the 500-character limit", () => {
    // 498 plain characters, then an emoji (a surrogate pair at UTF-16 index 498-499), then more text.
    // Code-unit slicing to 499 would keep the high surrogate and drop the low one.
    const reason = `${"a".repeat(498)}😀${"b".repeat(50)}`;
    const text = lineTextFor("request_rejected", { ...PAYLOAD, reason }, ORIGIN);
    const [, en] = blocks(text);
    expect(en).toContain(`${"a".repeat(498)}😀…`);
    expect(text).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    expect(text).not.toMatch(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
  });

  it("keeps a reason of exactly 500 code points (emoji included) whole", () => {
    // 500 code points but 501 UTF-16 units: a code-unit length check would wrongly clip it.
    const reason = `${"a".repeat(499)}😀`;
    const text = lineTextFor("request_rejected", { ...PAYLOAD, reason }, ORIGIN);
    const [, en] = blocks(text);
    expect(en).toContain(`Reason: ${reason}`);
    expect(text).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it("shows the reason in both languages when one is given", () => {
    const text = lineTextFor("request_rejected", { ...PAYLOAD, reason: "Room is needed for an exam" }, ORIGIN);
    const [th, en] = blocks(text);
    expect(th).toContain("Room is needed for an exam");
    expect(en).toContain("Room is needed for an exam");
  });

  it("leaves out the course code when it is null", () => {
    const text = lineTextFor("booking_moved", { ...PAYLOAD, courseCode: null }, ORIGIN);
    const [, en] = blocks(text);
    expect(en).toContain("Room A1");
    expect(en).not.toContain("null");
    expect(text).not.toContain("null");
    expect(en).not.toMatch(/^ ·/);
  });

  it("shows the weekly day when there is no date (recurring booking)", () => {
    const text = lineTextFor(
      "booking_cancelled_by_instructor",
      { ...PAYLOAD, date: null, dayOfWeek: 1 },
      ORIGIN,
    );
    const [th, en] = blocks(text);
    expect(en).toContain("every Monday");
    expect(th).toContain("ทุกวันจันทร์");
    expect(text).not.toContain("undefined");
  });

  it("handles a recurring booking with neither date nor weekday", () => {
    const text = lineTextFor("request_approved", { ...PAYLOAD, date: null, dayOfWeek: null }, ORIGIN);
    expect(text).not.toContain("null");
    expect(text).not.toContain("undefined");
    expect(blocks(text)[1]).toContain("09:00-12:00");
  });

  it("puts the request number in the title", () => {
    const text = lineTextFor("request_submitted", PAYLOAD, ORIGIN);
    expect(text).toContain("REQ-0001");
  });

  it("covers all six notification types with different titles", () => {
    const titles = ALL_TYPES.map((t) => blocks(lineTextFor(t, PAYLOAD, ORIGIN))[1]?.split("\n")[0]);
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
    expect(en).toContain("send any message here");
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
    const [th, en] = blocks(lineTextFor("request_approved", PAYLOAD, ORIGIN));
    expect(th).toContain("2569");
    expect(th).not.toContain("2026");
    expect(en).toContain("2026");
    expect(en).not.toContain("2569");
  });
});
