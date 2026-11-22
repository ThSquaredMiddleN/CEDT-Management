import type { NewsTag } from "@/api/types";
import {
  announcementPlainText,
  formatAnnouncementDate,
} from "@/features/announcements/announcement-utils";

export const MAX_NEWS_IMAGES = 10;
export const MAX_NEWS_IMAGE_BYTES = 10 * 1024 * 1024;

export const NEWS_TAGS: { value: NewsTag; label: string }[] = [
  { value: "competition", label: "งานแข่งขัน" },
  { value: "activities", label: "กิจกรรม" },
  { value: "scholarship", label: "ทุนการศึกษา" },
  { value: "internship", label: "ฝึกงาน" },
  { value: "academic", label: "วิชาการ" },
  { value: "other", label: "อื่นๆ" },
];

export const newsTagLabel = (tag: NewsTag): string =>
  NEWS_TAGS.find((item) => item.value === tag)?.label ?? tag;

export const newsTagClassName = (_tag: NewsTag): string =>
  "border-transparent bg-grey-100 text-grey-700";

const SIDEBAR_TAG_CLASSES: Record<NewsTag, string> = {
  competition: "bg-brand-primary/10 text-brand-primary",
  activities: "bg-emerald-500/10 text-emerald-600",
  scholarship: "bg-amber-500/10 text-amber-700",
  internship: "bg-violet-500/10 text-violet-700",
  academic: "bg-sky-500/10 text-sky-700",
  other: "bg-grey-100 text-grey-700",
};

export const newsSidebarTagClassName = (tag: NewsTag): string => SIDEBAR_TAG_CLASSES[tag];

export const newsPlainText = announcementPlainText;

export const newsDate = (value: string): string => formatAnnouncementDate(value);

export const newsImageUrl = (newsId: string, imageId: string): string =>
  `/api/v1/news/${newsId}/images/${imageId}`;
