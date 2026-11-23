import { Link } from "react-router-dom";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import type { Announcement } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  announcementPlainText,
  audienceLabel,
  formatAnnouncementDate,
  normalizeAnnouncementAudiences,
} from "../announcement-utils";

interface AnnouncementSummaryCardProps {
  announcement: Announcement;
  to: string;
  variant?: "compact" | "detailed";
}

export function AnnouncementSummaryCard({
  announcement,
  to,
  variant = "compact",
}: AnnouncementSummaryCardProps) {
  const preview = announcementPlainText(announcement.content);
  const date = announcement.publishedAt ?? announcement.updatedAt;

  if (variant === "detailed") {
    return (
      <article className="flex flex-col gap-3 rounded-xl border border-grey-200 bg-surface px-5 py-4">
        <h3 className="font-body text-header-xxs-emphasize text-brand-primary">
          {announcement.title}
        </h3>
        {preview && (
          <p className="line-clamp-2 font-body text-body-sm text-grey-700">
            {preview}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <time
            dateTime={date}
            className="font-body text-body-xs-emphasize text-grey-700"
          >
            {formatAnnouncementDate(date, true)}
          </time>
          <Button
            asChild
            variant="outlined"
            size="small"
            icon={<ArrowRightIcon />}
            className="w-[120px] px-0"
          >
            <Link to={to}>ดูเพิ่มเติม</Link>
          </Button>
        </div>
      </article>
    );
  }

  return (
    <Link
      to={to}
      className="block rounded-xl border border-neutral-200 bg-white px-5 py-4 transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-body text-body-sm-emphasize text-brand-primary">
          {announcement.title}
        </h3>
        {normalizeAnnouncementAudiences(announcement.audiences).map((audience) => (
          <Badge
            key={audience}
            variant="secondary"
            className="rounded-full border-transparent bg-grey-100 font-body text-body-xs text-grey-700"
          >
            {audienceLabel(audience)}
          </Badge>
        ))}
      </div>
      {preview && (
        <p className="mt-3 line-clamp-2 font-body text-body-xs-emphasize text-grey-400">
          {preview}
        </p>
      )}
      <p className="mt-2 font-body text-body-xs text-grey-200">
        {formatAnnouncementDate(date)}
      </p>
    </Link>
  );
}
