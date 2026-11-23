import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import {
  CalendarIcon,
  CpuChipIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";
import { useAnnouncements, useNews } from "@/api/endpoints";
import { EmptyState, ErrorCard, Spinner } from "@/components/states";
import { Button } from "@/components/ui/button";
import { normalizeAnnouncementAudiences } from "@/features/announcements/announcement-utils";
import { AnnouncementSummaryCard } from "@/features/announcements/components/AnnouncementSummaryCard";
import {
  AnnouncementYearFilter,
  type AnnouncementYearFilterValue,
} from "@/features/announcements/components/AnnouncementYearFilter";
import { ServiceLinkCard } from "@/features/cu-links/components/ServiceLinkCard";
import { CU_LINKS } from "@/features/cu-links/data/cuLinks";
import { NewsSidebar } from "@/features/news/components/NewsSidebar";

const PLACEHOLDER_SERVICES = [
  {
    id: "drop-withdraw",
    title: "ลด/ถอนรายวิชา",
    description: "จัดการรายวิชาของคุณ",
    icon: DocumentTextIcon,
  },
  {
    id: "iot-borrow",
    title: "ยืมอุปกรณ์ IoT",
    description: "แบบฟอร์มยืมอุปกรณ์",
    icon: CpuChipIcon,
  },
] as const;

export function StudentHome() {
  const [yearFilter, setYearFilter] = useState<AnnouncementYearFilterValue>("any");
  const announcementsQuery = useAnnouncements();
  const newsQuery = useNews();

  const publishedAnnouncements = (announcementsQuery.data?.items ?? []).filter(
    (announcement) => announcement.status === "published",
  );
  const visibleAnnouncements = publishedAnnouncements
    .filter(
      (announcement) =>
        yearFilter === "any" ||
        normalizeAnnouncementAudiences(announcement.audiences).includes(yearFilter),
    )
    .slice(0, 4);

  const publishedNews = (newsQuery.data?.items ?? []).filter(
    (news) => news.status === "published",
  );

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-6 py-8 md:px-16 xl:px-32">
        <header className="flex flex-col gap-2">
          <h1 className="font-body text-header-sm-emphasize text-grey-900">Home</h1>
          <p className="font-body text-body-md text-grey-700">
            ประกาศ ข่าวสาร และบริการสำหรับนิสิต CEDT
          </p>
        </header>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_212px]">
          <section
            aria-labelledby="home-announcements-title"
            className="flex min-w-0 flex-col gap-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link
                to="/announcements"
                id="home-announcements-title"
                className="font-body text-header-xs-emphasize text-grey-900 transition-colors hover:text-brand-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
              >
                ประกาศ
              </Link>
              <AnnouncementYearFilter value={yearFilter} onChange={setYearFilter} />
            </div>

            <div className="flex flex-col gap-3">
              {announcementsQuery.isPending && (
                <div className="flex justify-center py-8" role="status" aria-label="กำลังโหลด">
                  <Spinner />
                </div>
              )}
              {announcementsQuery.error && (
                <ErrorCard
                  message={
                    announcementsQuery.error instanceof Error
                      ? announcementsQuery.error.message
                      : "โหลดประกาศไม่สำเร็จ"
                  }
                  onRetry={() => void announcementsQuery.refetch()}
                />
              )}
              {!announcementsQuery.isPending &&
                !announcementsQuery.error &&
                publishedAnnouncements.length === 0 && (
                  <EmptyState title="ยังไม่มีประกาศที่เผยแพร่" />
                )}
              {!announcementsQuery.isPending &&
                !announcementsQuery.error &&
                publishedAnnouncements.length > 0 &&
                visibleAnnouncements.length === 0 && (
                  <EmptyState title="ไม่พบประกาศสำหรับชั้นปีนี้" />
                )}
              {visibleAnnouncements.map((announcement) => (
                <AnnouncementSummaryCard
                  key={announcement.id}
                  announcement={announcement}
                  to={`/announcements/${announcement.id}`}
                  variant="compact"
                />
              ))}
            </div>
          </section>

          <NewsSidebar
            items={publishedNews}
            headingTo="/news"
            isLoading={newsQuery.isPending}
            error={newsQuery.error}
            onRetry={() => void newsQuery.refetch()}
          />
        </div>

        <section
          aria-label="ทางลัดตารางเรียนและตารางสอบ"
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-grey-200 bg-surface p-6 sm:p-8"
        >
          <div className="flex items-center gap-4">
            <CalendarIcon className="size-8 shrink-0 text-grey-900" aria-hidden="true" />
            <h2 className="font-body text-header-xs-emphasize text-grey-900">
              ตารางเรียน / สอบ
            </h2>
          </div>
          <Button
            asChild
            variant="outlined"
            size="small"
            icon={<ArrowRightIcon />}
            className="w-[190px] px-4"
          >
            <Link to="/calendar">ดูตารางเรียน / สอบ</Link>
          </Button>
        </section>

        <section
          aria-label="บริการเพิ่มเติม"
          className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
        >
          {PLACEHOLDER_SERVICES.map(({ id, title, description, icon: Icon }) => (
            <div
              key={id}
              aria-disabled="true"
              className="flex items-center gap-3.5 rounded-xl border border-neutral-200 bg-white px-[18px] py-3.5 opacity-80"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-grey-100">
                <Icon className="size-4 text-grey-700" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="font-body text-body-sm-emphasize text-grey-900">{title}</p>
                <p className="font-body text-body-xs text-grey-400">{description}</p>
              </div>
            </div>
          ))}
        </section>

        <section aria-labelledby="home-cu-links-title" className="flex flex-col gap-6">
          <h2
            id="home-cu-links-title"
            className="font-body text-header-xs-emphasize text-grey-900"
          >
            CU Links
          </h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {CU_LINKS.map((item) => (
              <ServiceLinkCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
