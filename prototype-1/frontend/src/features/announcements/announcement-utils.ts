import DOMPurify from "dompurify";
import type { AnnouncementAudience } from "@/api/types";

export type AnnouncementYearAudience = Exclude<AnnouncementAudience, "all">;

export const ANNOUNCEMENT_YEAR_AUDIENCES: AnnouncementYearAudience[] = [
  "year1",
  "year2",
  "year3",
  "year4",
];

export const ANNOUNCEMENT_AUDIENCES: {
  value: AnnouncementAudience;
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "year1", label: "ปี 1" },
  { value: "year2", label: "ปี 2" },
  { value: "year3", label: "ปี 3" },
  { value: "year4", label: "ปี 4" },
];

export function normalizeAnnouncementAudiences(
  audiences: readonly AnnouncementAudience[] | null | undefined,
): AnnouncementYearAudience[] {
  if (!audiences || audiences.includes("all")) {
    return [...ANNOUNCEMENT_YEAR_AUDIENCES];
  }
  return audiences.filter(
    (audience): audience is AnnouncementYearAudience => audience !== "all",
  );
}

export function audienceLabel(audience: AnnouncementAudience): string {
  return ANNOUNCEMENT_AUDIENCES.find((option) => option.value === audience)?.label ?? audience;
}

export function formatAnnouncementDate(value: string, english = false): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const formatted = new Intl.DateTimeFormat(
    english ? "en-GB" : "th-TH-u-ca-buddhist",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Bangkok",
    },
  ).format(date);
  return english ? formatted.toUpperCase() : formatted;
}

export function sanitizeAnnouncementHtml(value: string): string {
  return DOMPurify.sanitize(value);
}

export function announcementPlainText(value: string): string {
  const safeHtml = sanitizeAnnouncementHtml(value);
  return new DOMParser().parseFromString(safeHtml, "text/html").body.textContent?.replace(
    /\s+/g,
    " ",
  ).trim() ?? "";
}
