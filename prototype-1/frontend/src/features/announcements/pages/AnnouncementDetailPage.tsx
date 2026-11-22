import { Link, useParams } from "react-router-dom";
import { ArrowLeftIcon } from "@heroicons/react/20/solid";
import { useAnnouncement, usePublishAnnouncement } from "@/api/endpoints";
import { useToast } from "@/app/toast";
import { Button } from "@/components/ui/button";
import { ErrorCard, Spinner } from "@/components/states";
import { AnnouncementArticle } from "../components/AnnouncementArticle";

export function AnnouncementDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const query = useAnnouncement(id ?? null);
  const publishAnnouncement = usePublishAnnouncement(id ?? "");

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
                  toast("เผยแพร่ประกาศเรียบร้อยแล้ว");
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
