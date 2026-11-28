/**
 * Answers for the LINE bot's FAQ. Each entry is a fact that holds in this codebase today; do not add
 * anything that is not (no office hours, deadlines or contacts until the team supplies them).
 *
 * TODO(team): add office hours, deadlines, contacts and other faculty facts here once the team confirms them.
 */

export interface FaqEntry {
  /** Shown in the FAQ list. */
  question: string;
  /** Lowercase. Matched when the user's text contains one. The first is shown as the hint to type. */
  keywords: readonly string[];
  /** The reply text. `origin` is the web app's address (config.APP_ORIGIN). */
  answer: (origin: string) => string;
}

export const FAQ: readonly FaqEntry[] = [
  {
    question: "เชื่อมบัญชี LINE ทำอย่างไร",
    keywords: ["วิธีเชื่อม", "เชื่อมยังไง", "how to link"],
    answer: (origin) =>
      [
        "วิธีเชื่อมบัญชี LINE",
        '1) พิมพ์ "เชื่อม" ที่นี่ เพื่อรับลิงก์',
        "2) เปิดลิงก์ เข้าสู่ระบบ แล้วกดยืนยัน",
        'ลิงก์มีอายุจำกัด หากหมดอายุ พิมพ์ "เชื่อม" อีกครั้งเพื่อรับลิงก์ใหม่',
        `หรือดูที่หน้าตั้งค่า LINE: ${origin}/line`,
      ].join("\n"),
  },
  {
    question: "ดูข่าวและประกาศได้ที่ไหน",
    keywords: ["ดูข่าวที่ไหน", "ดูประกาศที่ไหน", "where to read"],
    answer: (origin) =>
      [
        "ดูได้ที่เว็บ ไม่ต้องเข้าสู่ระบบ",
        `ข่าว: ${origin}/news`,
        `ประกาศ: ${origin}/announcements`,
        'หรือพิมพ์ "ข่าว" / "ประกาศ" ที่นี่เพื่อดูรายการล่าสุด',
      ].join("\n"),
  },
  {
    question: "ยกเลิกการเชื่อม LINE ทำอย่างไร",
    // Not a bare "ยกเลิก": it would catch "ยกเลิกการจอง" (cancel a booking) and other modules' words.
    // The first keyword is shown as a hint; the spaced form stays because people type it that way.
    keywords: ["เลิกเชื่อม", "ยกเลิกเชื่อม", "ยกเลิก เชื่อม", "ยกเลิกการเชื่อม", "ยกเลิก line", "ยกเลิกไลน์", "unlink", "disconnect"],
    answer: (origin) =>
      [
        "ยกเลิกการเชื่อมได้ที่หน้าตั้งค่า LINE (ต้องเข้าสู่ระบบ) แล้วกด ยืนยันการยกเลิก",
        `${origin}/line`,
        "หากบล็อก LINE นี้ ระบบจะยกเลิกการเชื่อมให้อัตโนมัติ",
      ].join("\n"),
  },
];
