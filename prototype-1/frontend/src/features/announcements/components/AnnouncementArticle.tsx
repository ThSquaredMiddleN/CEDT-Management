import type { Announcement } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import {
  audienceLabel,
  formatAnnouncementDate,
  normalizeAnnouncementAudiences,
  sanitizeAnnouncementHtml,
} from "../announcement-utils";

interface AnnouncementArticleProps {
  announcement: Announcement;
  showStatus?: boolean;
}

export function AnnouncementArticle({
  announcement,
  showStatus = true,
}: AnnouncementArticleProps) {
  const date = announcement.publishedAt ?? announcement.updatedAt;

  return (
    <article className="rounded-xl border border-neutral-200 bg-white px-5 py-4">
      <div className="flex items-center justify-between gap-4">
        <time
          dateTime={date}
          className="font-body text-body-xs-emphasize text-grey-900"
        >
          {formatAnnouncementDate(date, true)}
        </time>
        {showStatus && (
          <Badge
            variant="secondary"
            className="rounded-full border-transparent bg-grey-100 font-body text-body-xs text-grey-400"
          >
            {announcement.status === "draft" ? "ฉบับร่าง" : "เผยแพร่แล้ว"}
          </Badge>
        )}
      </div>
      <h1 className="mt-4 font-body text-header-xs-emphasize text-brand-primary">
        {announcement.title}
      </h1>
      <div className="mt-4 flex flex-wrap gap-2">
        {normalizeAnnouncementAudiences(announcement.audiences).map((audience) => (
          <Badge
            key={audience}
            variant="secondary"
            className="rounded-full border-transparent bg-grey-100 font-body text-body-xs text-grey-400"
          >
            {audienceLabel(audience)}
          </Badge>
        ))}
      </div>
      <hr className="my-4 border-neutral-200" />
      <div
        className="announcement-rich-content font-body text-body-md text-grey-400"
        dangerouslySetInnerHTML={{ __html: sanitizeAnnouncementHtml(announcement.content) }}
      />
    </article>
  );
}
