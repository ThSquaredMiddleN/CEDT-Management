import { Link, useParams } from "react-router-dom";
import { ArrowLeftIcon } from "@heroicons/react/20/solid";
import { useAnnouncement } from "@/api/endpoints";
import { ErrorCard, Spinner } from "@/components/states";
import { AnnouncementArticle } from "../components/AnnouncementArticle";

export function StudentAnnouncementDetailPage() {
  const { id } = useParams();
  const query = useAnnouncement(id ?? null);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-6 py-8 md:px-16 xl:px-32">
        <Link
          to="/announcements"
          className="inline-flex w-fit items-center gap-1 font-body text-body-md-emphasize text-grey-900 hover:text-grey-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        >
          <ArrowLeftIcon className="size-5" aria-hidden="true" />
          Back
        </Link>

        {!id && <ErrorCard message="ไม่พบรหัสประกาศ" />}

        {id && query.isPending && (
          <div className="flex justify-center py-12" role="status" aria-label="กำลังโหลด">
            <Spinner />
          </div>
        )}

        {id && !query.isPending && (query.error || !query.data) && (
          <ErrorCard
            message={query.error instanceof Error ? query.error.message : "โหลดประกาศไม่สำเร็จ"}
            onRetry={() => void query.refetch()}
          />
        )}

        {id &&
          !query.isPending &&
          query.data &&
          query.data.announcement.status !== "published" && (
            <ErrorCard message="ไม่พบประกาศที่ต้องการ" />
          )}

        {id &&
          !query.isPending &&
          query.data &&
          query.data.announcement.status === "published" && (
            <AnnouncementArticle announcement={query.data.announcement} showStatus={false} />
          )}
      </div>
    </div>
  );
}
