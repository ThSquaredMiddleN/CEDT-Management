import type { NotificationType } from "@prisma/client";
import type { NotifyPayload } from "../notifications/service.js";

/**
 * Text for LINE. Each message is one text: Thai block, English block, then the app link, separated by
 * blank lines. Thai comes first because the staff are Thai speakers.
 */

const TIME_ZONE = "Asia/Bangkok";
const MAX_TEXT_CHARS = 5000;
const MAX_REASON_CHARS = 500;

type Copy = { th: string; en: string };

const TITLES: Record<NotificationType, (requestNo: string) => Copy> = {
  request_submitted: (n) => ({ th: `มีคำขอใหม่ ${n}`, en: `New request ${n}` }),
  request_approved: (n) => ({ th: `คำขอ ${n} ได้รับการอนุมัติแล้ว`, en: `Request ${n} approved` }),
  request_rejected: (n) => ({ th: `คำขอ ${n} ไม่ได้รับการอนุมัติ`, en: `Request ${n} rejected` }),
  booking_moved: (n) => ({ th: `การจอง ${n} ถูกย้าย`, en: `Booking ${n} was moved` }),
  booking_cancelled_by_instructor: (n) => ({ th: `การจอง ${n} ถูกยกเลิก`, en: `Booking ${n} was cancelled` }),
  request_withdrawn: (n) => ({ th: `คำขอ ${n} ถูกถอน`, en: `Request ${n} was withdrawn` }),
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
function clip(s: string, max: number): string {
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
 * A field every message needs. A payload without it is not sent: it would show "undefined" to the user, so
 * lineTextFor throws and the dispatcher marks the notification as a render failure.
 */
function requiredText(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`payload.${name} is missing`);
  return value;
}

/** The notification text for LINE. Pure: the app origin is passed in, nothing is read from config. Throws on a payload it cannot render. */
export function lineTextFor(type: NotificationType, payload: NotifyPayload, appOrigin: string): string {
  const requestNo = requiredText(payload?.requestNo, "requestNo");
  requiredText(payload?.roomName, "roomName");
  requiredText(payload?.startTime, "startTime");
  requiredText(payload?.endTime, "endTime");
  const title = TITLES[type](requestNo);
  const reason = payload.reason ? clip(payload.reason, MAX_REASON_CHARS) : null;

  const th = [title.th, detailLine(payload, "th"), ...(reason ? [`เหตุผล: ${reason}`] : [])].join("\n");
  const en = [title.en, detailLine(payload, "en"), ...(reason ? [`Reason: ${reason}`] : [])].join("\n");
  // Approvers act on the dashboard queue; every other type is about the reader's own request.
  const path = type === "request_submitted" ? "/admin/dashboard" : "/requests";
  const text = [th, en, `${appOrigin}${path}`].join("\n\n");
  return clip(text, MAX_TEXT_CHARS);
}

/** Sent after a user adds the bot as a friend or messages it while not linked. `url` is the one-time link. */
export function linkPrompt(url: string): string {
  return [
    "เชื่อมบัญชี LINE เพื่อรับการแจ้งเตือนจากระบบ ลิงก์นี้มีอายุจำกัด",
    "Link your LINE account to receive notifications. This link expires soon.",
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
    "เชื่อมบัญชี LINE สำเร็จ คุณจะได้รับการแจ้งเตือนจากระบบ",
    "LINE account linked. You will now receive notifications.",
  ].join("\n\n");
}
