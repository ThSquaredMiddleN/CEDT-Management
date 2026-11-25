import { config } from "../../config.js";
import { listAnnouncements } from "../announcements/service.js";
import { listNews } from "../news/service.js";
import type { LineMessage, LineQuickReplyItem } from "./client.js";
import { FAQ } from "./faq.js";
import { alreadyLinked, clip, linkFor } from "./messages.js";

/**
 * Answers for text sent to the LINE bot (step 1 of the chatbot: fixed keywords, no AI).
 * Reads only published news and announcements, which the web portal shows without login, so an unlinked user
 * gets them too. Nothing here logs: message text and names must not reach the logs.
 */

export type Viewer =
  | {
      linked: false;
      /** The one-time link message text. The caller issues the token; answerText only places it. */
      linkText?: string;
    }
  | { linked: true; name: string };

export type Intent =
  | { kind: "menu" }
  | { kind: "news" }
  | { kind: "announcements" }
  | { kind: "faqList" }
  | { kind: "faq"; index: number }
  | { kind: "link" }
  | { kind: "unknown" };

const MAX_MESSAGES = 5;
const MAX_LISTED = 5;
const MAX_TITLE_CHARS = 80;
const MAX_INPUT_CHARS = 200;

/** Menu words match the whole text, so a "?" inside a sentence does not open the menu. */
const MENU_EXACT = ["เมนู", "ช่วย", "ช่วยเหลือ", "help", "menu", "?", "？"];
const NEWS_WORDS = ["ข่าว", "news"];
const ANNOUNCEMENT_WORDS = ["ประกาศ", "announcement"];
const FAQ_WORDS = ["faq", "คำถาม"];
/** Link words match the whole text too: "blink 182" or "เชื่อมั่น" must not issue a login link. */
const LINK_EXACT = ["เชื่อม", "เชื่อมบัญชี", "link", "link account"];
/** A word that contains "ประกาศ" but is not about announcements; removed before matching. */
const NOT_ANNOUNCEMENT = "ประกาศนียบัตร";
/** Zero-width space, joiners, word joiner and BOM: invisible, so stripped before matching. */
const INVISIBLE = /[\u200B-\u200D\u2060\uFEFF]/gu;

function normalise(text: string): string {
  const clean = text.normalize("NFC").replace(INVISIBLE, "");
  // Cut by code points, so an emoji is never split.
  return Array.from(clean).slice(0, MAX_INPUT_CHARS).join("").trim().toLowerCase().replace(/\s+/gu, " ");
}
const hasAny = (text: string, words: readonly string[]): boolean => words.some((w) => text.includes(w));

/**
 * The most specific match wins: an FAQ entry's own keywords first (so "unlink" is not taken for "link"),
 * then news, announcements, the FAQ list, linking, and last the exact menu words.
 */
export function intentOf(rawText: string): Intent {
  const text = normalise(rawText);
  const faqIndex = FAQ.findIndex((entry) => hasAny(text, entry.keywords));
  if (faqIndex >= 0) return { kind: "faq", index: faqIndex };
  if (hasAny(text, NEWS_WORDS)) return { kind: "news" };
  if (hasAny(text.replaceAll(NOT_ANNOUNCEMENT, ""), ANNOUNCEMENT_WORDS)) return { kind: "announcements" };
  if (hasAny(text, FAQ_WORDS)) return { kind: "faqList" };
  if (LINK_EXACT.includes(text)) return { kind: "link" };
  if (MENU_EXACT.includes(text)) return { kind: "menu" };
  return { kind: "unknown" };
}

/** True when an unlinked user's answer should carry a one-time link (asked to link, or the text was not understood). */
export function needsLinkOffer(intent: Intent, viewer: { linked: boolean }): boolean {
  return !viewer.linked && (intent.kind === "link" || intent.kind === "unknown");
}

const quickItem = (label: string, text: string): LineQuickReplyItem => ({
  type: "action",
  action: { type: "message", label, text },
});

function quickReplies(viewer: Viewer): NonNullable<LineMessage["quickReply"]> {
  const items = [quickItem("ข่าว", "ข่าว"), quickItem("ประกาศ", "ประกาศ"), quickItem("คำถามที่พบบ่อย", "คำถาม"), quickItem("เมนู", "เมนู")];
  if (!viewer.linked) items.push(quickItem("เชื่อมบัญชี", "เชื่อม"));
  return { items };
}

const text = (t: string): LineMessage => ({ type: "text", text: t });

interface Listed {
  id: string;
  title: string;
}

function listText(heading: string, items: readonly Listed[], path: string, empty: string): string {
  if (items.length === 0) return empty;
  const lines = items.slice(0, MAX_LISTED).map((item, i) => {
    const title = clip(item.title.replace(/\s+/gu, " ").trim(), MAX_TITLE_CHARS);
    return `${i + 1}. ${title}\n${linkFor(config.APP_ORIGIN, `${path}/${item.id}`)}`;
  });
  return [heading, ...lines].join("\n\n");
}

async function messagesFor(intent: Intent, viewer: Viewer): Promise<LineMessage[]> {
  switch (intent.kind) {
    case "news": {
      const { items } = await listNews({ publishedOnly: true });
      return [text(listText("ข่าวล่าสุด", items, "/news", "ยังไม่มีข่าว"))];
    }
    case "announcements": {
      const { items } = await listAnnouncements({ publishedOnly: true });
      return [text(listText("ประกาศล่าสุด", items, "/announcements", "ยังไม่มีประกาศ"))];
    }
    case "faqList": {
      const lines = FAQ.map((entry, i) => `${i + 1}. ${entry.question} (พิมพ์ "${entry.keywords[0]}")`);
      return [text(["คำถามที่พบบ่อย", ...lines].join("\n"))];
    }
    case "faq": {
      const entry = FAQ[intent.index];
      return [text(entry ? entry.answer(config.APP_ORIGIN) : "ยังตอบไม่ได้")];
    }
    case "link": {
      if (viewer.linked) return [text(alreadyLinked(viewer.name))];
      return viewer.linkText ? [text(viewer.linkText)] : [text('พิมพ์ "เชื่อม" เพื่อรับลิงก์เชื่อมบัญชี')];
    }
    case "menu":
      return [text(["ถามได้เลย เลือกหัวข้อด้านล่าง หรือพิมพ์ข้อความ เช่น", "ข่าว · ประกาศ · คำถาม · เมนู"].join("\n"))];
    case "unknown": {
      const unknown = text('ขออภัย ยังตอบเรื่องนี้ไม่ได้ ลองเลือกหัวข้อด้านล่าง หรือพิมพ์ "เมนู"');
      return !viewer.linked && viewer.linkText ? [unknown, text(viewer.linkText)] : [unknown];
    }
  }
}

/**
 * The reply to one text message: at most MAX_MESSAGES messages, quick reply buttons on the last one.
 * Throws if the database read fails; the webhook then answers 500 and LINE redelivers.
 */
export async function answerText(rawText: string, viewer: Viewer): Promise<LineMessage[]> {
  const messages = (await messagesFor(intentOf(rawText), viewer)).slice(0, MAX_MESSAGES);
  const last = messages[messages.length - 1];
  if (last) last.quickReply = quickReplies(viewer);
  return messages;
}
