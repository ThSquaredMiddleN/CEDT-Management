import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { PlusIcon } from "@heroicons/react/24/outline";
import { useAnnouncements } from "@/api/endpoints";
import type { Announcement } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorCard, Spinner } from "@/components/states";
import {
  announcementPlainText,
  audienceLabel,
  formatAnnouncementDate,
  normalizeAnnouncementAudiences,
  type AnnouncementYearAudience,
} from "../announcement-utils";

const filters: { value: AnnouncementYearAudience | "any"; label: string }[] = [
  { value: "any", label: "All" },
  { value: "year1", label: "ปี 1" },
  { value: "year2", label: "ปี 2" },
  { value: "year3", label: "ปี 3" },
  { value: "year4", label: "ปี 4" },
];

function DraftCard({ announcement }: { announcement: Announcement }) {
  return (
    <Link
      to={`/admin/announcements/${announcement.id}`}
      className="block rounded-xl border border-neutral-200 bg-white px-5 py-4 transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 truncate font-body text-body-sm-emphasize text-brand-primary">
          {announcement.title}
        </h3>
        <Badge
          variant="secondary"
          className="shrink-0 rounded-full border-transparent bg-grey-100 font-body text-body-xs text-grey-700"
        >
          ฉบับร่าง
        </Badge>
      </div>
      <p className="mt-3 line-clamp-4 font-body text-body-xs text-grey-400">
        {announcementPlainText(announcement.content)}
      </p>
      <p className="mt-2 font-body text-body-xs text-grey-200">
        บันทึกล่าสุด {formatAnnouncementDate(announcement.updatedAt)}
      </p>
    </Link>
  );
}

function PublishedCard({ announcement }: { announcement: Announcement }) {
  const preview = announcementPlainText(announcement.content);

  return (
    <Link
      to={`/admin/announcements/${announcement.id}`}
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
        {announcement.publishedAt
          ? formatAnnouncementDate(announcement.publishedAt)
          : formatAnnouncementDate(announcement.updatedAt)}
      </p>
    </Link>
  );
}

export function AnnouncementListPage() {
  const [filter, setFilter] = useState<AnnouncementYearAudience | "any">("any");
  const location = useLocation();
  const navigate = useNavigate();
  const [successMessage] = useState<string | null>(() =>
    location.state === "announcement-created"
      ? "สร้างร่างประกาศและบันทึกแล้ว"
      : null,
  );
  const query = useAnnouncements();
  const { data, error, isPending, refetch, isFetching } = query;
  const announcements = data?.items ?? [];
  const drafts = announcements.filter((announcement) => announcement.status === "draft");
  const published = announcements.filter(
    (announcement) =>
      announcement.status === "published" &&
      (filter === "any" ||
        normalizeAnnouncementAudiences(announcement.audiences).includes(filter)),
  );

  useEffect(() => {
    if (location.state === "announcement-created") {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    }
  }, [location.pathname, location.search, location.state, navigate]);

  return (
    <div className="w-full px-4 py-6 md:px-8 lg:px-16 lg:py-8">
      <h1 className="font-body text-header-sm-emphasize text-grey-900">จัดการประกาศ</h1>
      {successMessage && (
        <p
          className="mb-5 rounded-lg border border-grey-200 bg-grey-100 px-4 py-3 font-body text-body-sm text-grey-700"
          role="status"
        >
          {successMessage}
        </p>
      )}

      <div className="mt-6 grid min-w-0 grid-cols-1 items-start gap-8 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section aria-labelledby="announcement-drafts-title" className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <h2
              id="announcement-drafts-title"
              className="font-body text-header-xs-emphasize text-grey-900"
            >
              ร่างประกาศ
            </h2>
            <Badge variant="secondary" className="rounded-full border-transparent bg-grey-100">
              {isPending ? "…" : drafts.length}
            </Badge>
          </div>
          <Button
            asChild
            variant="filled"
            size="medium"
            className="mt-3 w-full"
          >
            <Link to="/admin/announcements/create">
              เพิ่มประกาศใหม่
              <PlusIcon className="size-[14px]" aria-hidden="true" />
            </Link>
          </Button>
          <div className="mt-3 space-y-3">
            {isPending && (
              <div className="flex justify-center py-8" role="status" aria-label="กำลังโหลด">
                <Spinner />
              </div>
            )}
            {error && (
              <ErrorCard
                message={error instanceof Error ? error.message : "โหลดร่างประกาศไม่สำเร็จ"}
                onRetry={() => void refetch()}
              />
            )}
            {!isPending && !error && drafts.length === 0 && (
              <EmptyState title="ยังไม่มีร่างประกาศ" />
            )}
            {drafts.map((announcement) => (
              <DraftCard key={announcement.id} announcement={announcement} />
            ))}
          </div>
        </section>

        <section aria-labelledby="announcement-list-title" className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2
              id="announcement-list-title"
              className="font-body text-header-xs-emphasize text-grey-900"
            >
              ประกาศ
            </h2>
            <div className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-grey-100 p-[3px]" aria-label="กรองตามชั้นปี">
              {filters.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={
                    filter === value
                      ? "h-[26px] shrink-0 rounded-md bg-white px-2.5 font-body text-body-xs text-grey-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                      : "h-[26px] shrink-0 rounded-md px-2.5 font-body text-body-xs text-grey-400 hover:text-grey-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {isPending && (
              <div className="flex justify-center py-8" role="status" aria-label="กำลังโหลด">
                <Spinner />
              </div>
            )}
            {error && (
              <ErrorCard
                message={error instanceof Error ? error.message : "โหลดประกาศไม่สำเร็จ"}
                onRetry={() => void refetch()}
              />
            )}
            {!isPending && !error && announcements.length === 0 && (
              <EmptyState title="ยังไม่มีประกาศ" />
            )}
            {!isPending && !error && announcements.length > 0 && published.length === 0 && (
              <EmptyState
                title={
                  filter === "any"
                    ? "ยังไม่มีประกาศที่เผยแพร่"
                    : "ไม่พบประกาศสำหรับชั้นปีนี้"
                }
              />
            )}
            {published.map((announcement) => (
              <PublishedCard key={announcement.id} announcement={announcement} />
            ))}
            {isFetching && !isPending && (
              <span className="sr-only" role="status">
                กำลังอัปเดตรายการประกาศ
              </span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
