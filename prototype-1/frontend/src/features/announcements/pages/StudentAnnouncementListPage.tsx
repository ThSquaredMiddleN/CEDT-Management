import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeftIcon } from "@heroicons/react/20/solid";
import { useAnnouncements } from "@/api/endpoints";
import { EmptyState, ErrorCard, Spinner } from "@/components/states";
import { normalizeAnnouncementAudiences } from "../announcement-utils";
import { AnnouncementSummaryCard } from "../components/AnnouncementSummaryCard";
import {
  AnnouncementYearFilter,
  type AnnouncementYearFilterValue,
} from "../components/AnnouncementYearFilter";

export function StudentAnnouncementListPage() {
  const [filter, setFilter] = useState<AnnouncementYearFilterValue>("any");
  const { data, error, isPending, refetch, isFetching } = useAnnouncements();
  const published = (data?.items ?? []).filter(
    (announcement) => announcement.status === "published",
  );
  const filtered = published.filter(
    (announcement) =>
      filter === "any" ||
      normalizeAnnouncementAudiences(announcement.audiences).includes(filter),
  );

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-6 py-8 md:px-16 xl:px-32">
        <Link
          to="/"
          className="inline-flex w-fit items-center gap-1 font-body text-body-md-emphasize text-grey-900 hover:text-grey-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        >
          <ArrowLeftIcon className="size-5" aria-hidden="true" />
          Back
        </Link>

        <header className="flex flex-col gap-2">
          <h1 className="font-body text-header-sm-emphasize text-grey-900">ประกาศ</h1>
          <p className="font-body text-body-md text-grey-700">
            ประกาศรายวิชาและข้อมูลสำหรับนิสิต
          </p>
        </header>

        <section aria-labelledby="student-announcements-list-title" className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2
              id="student-announcements-list-title"
              className="font-body text-header-xxs-emphasize text-grey-900"
            >
              ประกาศทั้งหมด
            </h2>
            <AnnouncementYearFilter value={filter} onChange={setFilter} />
          </div>

          <div className="flex flex-col gap-4">
            {isPending && (
              <div className="flex justify-center py-12" role="status" aria-label="กำลังโหลด">
                <Spinner />
              </div>
            )}
            {error && (
              <ErrorCard
                message={error instanceof Error ? error.message : "โหลดประกาศไม่สำเร็จ"}
                onRetry={() => void refetch()}
              />
            )}
            {!isPending && !error && published.length === 0 && (
              <EmptyState title="ยังไม่มีประกาศที่เผยแพร่" />
            )}
            {!isPending && !error && published.length > 0 && filtered.length === 0 && (
              <EmptyState title="ไม่พบประกาศสำหรับชั้นปีนี้" />
            )}
            {filtered.map((announcement) => (
              <AnnouncementSummaryCard
                key={announcement.id}
                announcement={announcement}
                to={`/announcements/${announcement.id}`}
                variant="detailed"
              />
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
