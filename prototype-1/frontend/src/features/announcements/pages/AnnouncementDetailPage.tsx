import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeftIcon } from "@heroicons/react/20/solid";
import { useAnnouncement, usePublishAnnouncement } from "@/api/endpoints";
import type { Announcement } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorCard, Spinner } from "@/components/states";
import {
  audienceLabel,
  formatAnnouncementDate,
  normalizeAnnouncementAudiences,
  sanitizeAnnouncementHtml,
} from "../announcement-utils";

function AnnouncementArticle({ announcement }: { announcement: Announcement }) {
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
        <Badge
          variant="secondary"
          className="rounded-full border-transparent bg-grey-100 font-body text-body-xs text-grey-400"
        >
          {announcement.status === "draft" ? "ฉบับร่าง" : "เผยแพร่แล้ว"}
        </Badge>
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

export function AnnouncementDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [successMessage, setSuccessMessage] = useState<string | null>(() =>
    location.state === "announcement-updated"
      ? "แก้ไขประกาศและบันทึกแล้ว"
      : null,
  );
  const query = useAnnouncement(id ?? null);
  const publishAnnouncement = usePublishAnnouncement(id ?? "");

  useEffect(() => {
    if (location.state === "announcement-updated") {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    }
  }, [location.pathname, location.search, location.state, navigate]);

  if (!id) return <ErrorCard message="ไม่พบรหัสประกาศ" />;
  if (query.isPending) {
    return (
      <div className="flex justify-center py-12" role="status" aria-label="กำลังโหลด">
        <Spinner />
      </div>
    );
  }
  if (query.error || !query.data) {
    return (
      <div className="mx-auto max-w-[963px] px-4 py-8 md:px-0">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link to="/admin/announcements">
            <ArrowLeftIcon className="size-4" aria-hidden="true" />
            กลับ
          </Link>
        </Button>
        <ErrorCard
          message={query.error instanceof Error ? query.error.message : "โหลดประกาศไม่สำเร็จ"}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  const announcement = query.data.announcement;

  return (
    <div className="mx-auto w-full max-w-[963px] px-4 py-6 md:px-0 lg:py-8">
      <Link
        to="/admin/announcements"
        className="inline-flex items-center gap-1 font-body text-body-sm-emphasize text-grey-900 hover:text-grey-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
      >
        <ArrowLeftIcon className="size-5" aria-hidden="true" />
        Back
      </Link>
      {successMessage && (
        <p
          className="mb-5 rounded-lg border border-grey-200 bg-grey-100 px-4 py-3 font-body text-body-sm text-grey-700"
          role="status"
        >
          {successMessage}
        </p>
      )}
      <div className="mt-6">
        <AnnouncementArticle announcement={announcement} />
      </div>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        {publishAnnouncement.isError && (
          <p className="mr-auto self-center font-body text-body-sm text-grey-900" role="alert">
            {publishAnnouncement.error instanceof Error
              ? publishAnnouncement.error.message
              : "เผยแพร่ประกาศไม่สำเร็จ"}
          </p>
        )}
        <Button
          asChild
          variant="outlined"
          size="medium"
        >
          <Link to={`/admin/announcements/${id}/edit`}>แก้ไข</Link>
        </Button>
        {announcement.status === "draft" && (
          <Button
            variant="filled"
            size="medium"
            loading={publishAnnouncement.isPending}
            onClick={() =>
              publishAnnouncement.mutate(undefined, {
                onSuccess: () => {
                  setSuccessMessage("เผยแพร่ประกาศและบันทึกแล้ว");
                  void query.refetch();
                },
              })
            }
          >
            Publish
          </Button>
        )}
      </div>
    </div>
  );
}
