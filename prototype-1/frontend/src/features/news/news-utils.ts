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

export const newsPlainText = announcementPlainText;

export const newsDate = (value: string): string => formatAnnouncementDate(value);

export const newsImageUrl = (newsId: string, imageId: string): string => {
  const path = `/api/v1/news/${newsId}/images/${imageId}`;
  const isDevelopmentAdminPage =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    (window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/"));
  return isDevelopmentAdminPage ? `${path}?devAdminBypass=true` : path;
};
