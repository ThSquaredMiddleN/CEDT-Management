/** Same zone the backend uses for its default term (APP_TZ). */
const APP_TZ = "Asia/Bangkok";

/** `1/2569`-style term; the same check the backend applies. */
export const TERM_PATTERN = /^[123]\/25\d\d$/;

/**
 * CU term for a date, in B.E. years: Aug–Dec → 1/<be>, Jan–May → 2/<be-1>, Jun–Jul → 3/<be-1>.
 * Mirrors `currentTerm()` in the backend receipts service.
 */
export function termFor(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "numeric",
  }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const be = year + 543;
  if (month >= 8) return `1/${be}`;
  if (month <= 5) return `2/${be - 1}`;
  return `3/${be - 1}`;
}

export const currentTerm = (): string => termFor(new Date());

/** The newest `count` distinct terms, current term first. Walks back one month at a time. */
export function recentTerms(count: number): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let back = 0; out.length < count && back < 120; back++) {
    // Mid-month noon keeps the calendar month unambiguous in APP_TZ.
    const probe = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 15, 12));
    const term = termFor(probe);
    if (!out.includes(term)) out.push(term);
  }
  return out;
}
