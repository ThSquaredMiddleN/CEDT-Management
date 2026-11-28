import type { NotifyPayload } from "../bookings/service.js";

/**
 * Text for LINE. Each message is one text, blocks separated by blank lines, the app link last.
 * A booking row whose payload renders gets a Thai block, then an English block, then the link. Thai comes
 * first because the staff are Thai speakers. Every other row, and a booking row that cannot be rendered, is
 * sent as its own message text followed by the link (fallbackTextFor).
 */

const TIME_ZONE = "Asia/Bangkok";
const MAX_TEXT_CHARS = 5000;
const MAX_REASON_CHARS = 500;

type Copy = { th: string; en: string };

/** Titles for booking rows, keyed by "bookings.<event>". A type with no entry makes lineTextFor throw. */
const TITLES: Record<string, ((requestNo: string) => Copy) | undefined> = {
  "bookings.request_submitted": (n) => ({ th: `มีคำขอใหม่ ${n}`, en: `New request ${n}` }),
  "bookings.request_approved": (n) => ({ th: `คำขอ ${n} ได้รับการอนุมัติแล้ว`, en: `Request ${n} approved` }),
  "bookings.request_rejected": (n) => ({ th: `คำขอ ${n} ไม่ได้รับการอนุมัติ`, en: `Request ${n} rejected` }),
  "bookings.booking_moved": (n) => ({ th: `การจอง ${n} ถูกย้าย`, en: `Booking ${n} was moved` }),
  "bookings.booking_cancelled_by_instructor": (n) => ({ th: `การจอง ${n} ถูกยกเลิก`, en: `Booking ${n} was cancelled` }),
  "bookings.request_withdrawn": (n) => ({ th: `คำขอ ${n} ถูกถอน`, en: `Request ${n} was withdrawn` }),
};

const DAYS_TH = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"] as const;
const DAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/**
 * A "YYYY-MM-DD" calendar date, shown at Bangkok midnight so the day does not shift. The Thai block uses the
 * Buddhist year (2569), the English block the Gregorian year (2026). The calendar is pinned, not left to the locale.
 */
function formatDate(ymd: string, lang: "th" | "en"): string {
  return new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-GB", {
    dateStyle: "long",
    timeZone: TIME_ZONE,
    calendar: lang === "th" ? "buddhist" : "gregory",
  }).format(new Date(`${ymd}T00:00:00+07:00`));
}

/** Clips by code points, so an emoji is never split into a lone surrogate. */
export function clip(s: string, max: number): string {
  const cps = Array.from(s);
  return cps.length > max ? `${cps.slice(0, max - 1).join("")}…` : s;
}

/** "CEDT205 · Room 301 · 12 November 2026 · 09:00-12:00", with missing parts left out. */
function detailLine(p: NotifyPayload, lang: "th" | "en"): string {
  const parts: string[] = [];
  if (p.courseCode) parts.push(p.courseCode);
  parts.push(p.roomName);
  if (p.date) {
    parts.push(formatDate(p.date, lang));
  } else if (p.dayOfWeek !== null && p.dayOfWeek !== undefined) {
    const day = lang === "th" ? `ทุกวัน${DAYS_TH[p.dayOfWeek]}` : `every ${DAYS_EN[p.dayOfWeek]}`;
    parts.push(day);
  }
  parts.push(`${p.startTime}-${p.endTime}`);
  return parts.join(" · ");
}

/**
 * A field every message needs. A payload without it is not sent as rich text: it would show "undefined" to the
 * user, so lineTextFor throws and the dispatcher sends the row's message instead.
 */
function requiredText(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`payload.${name} is missing`);
  return value;
}

/** The full URL for a row's in-app link. A null link goes to the app's root. */
export function linkFor(appOrigin: string, link: string | null): string {
  return `${appOrigin}${link ?? "/"}`;
}

/**
 * Rich text for a booking row. Pure: the URL is passed in, nothing is read from config. Throws on a type with no
 * title or on a payload it cannot render; the caller then falls back to fallbackTextFor.
 */
export function lineTextFor(type: string, payload: NotifyPayload, url: string): string {
  const titleOf = TITLES[type];
  if (!titleOf) throw new TypeError(`no LINE title for ${type}`);
  const requestNo = requiredText(payload?.requestNo, "requestNo");
  requiredText(payload?.roomName, "roomName");
  requiredText(payload?.startTime, "startTime");
  requiredText(payload?.endTime, "endTime");
  const title = titleOf(requestNo);
  const reason = payload.reason ? clip(payload.reason, MAX_REASON_CHARS) : null;

  const th = [title.th, detailLine(payload, "th"), ...(reason ? [`เหตุผล: ${reason}`] : [])].join("\n");
  const en = [title.en, detailLine(payload, "en"), ...(reason ? [`Reason: ${reason}`] : [])].join("\n");
  return clip([th, en, url].join("\n\n"), MAX_TEXT_CHARS);
}

/**
 * The row's own message, then the link. The message is clipped first so the link always stays whole.
 * Used for every row that is not a booking, and for a booking row that cannot be rendered.
 */
export function fallbackTextFor(message: string, url: string): string {
  const room = Math.max(1, MAX_TEXT_CHARS - url.length - "\n\n".length);
  return [clip(message, room), url].join("\n\n");
}

/** Sent after a user adds the bot as a friend or messages it while not linked. `url` is the one-time link. */
export function linkPrompt(url: string, minutes: number): string {
  return [
    `เชื่อมบัญชี LINE เพื่อรับการแจ้งเตือนจากระบบ ลิงก์นี้ใช้ได้ ${minutes} นาที หากลิงก์หมดอายุ พิมพ์ "เชื่อม" เพื่อรับลิงก์ใหม่`,
    `Link your LINE account to receive notifications. This link works for ${minutes} minutes. If it expires, send any message here for a new one.`,
    url,
  ].join("\n\n");
}

/** Sent when a linked user messages the bot. */
export function alreadyLinked(name: string): string {
  return [`บัญชี LINE นี้เชื่อมกับ ${name} แล้ว`, `This LINE account is already linked to ${name}.`].join("\n\n");
}

/** Sent after a successful link from the web app. */
export function linkedOk(): string {
  return [
    "เชื่อมบัญชี LINE สำเร็จ ระบบจะส่งการแจ้งเตือนมาที่ LINE นี้",
    "LINE account linked. You will now receive notifications.",
  ].join("\n\n");
}
