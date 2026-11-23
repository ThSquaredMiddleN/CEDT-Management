import { Link, useParams } from "react-router-dom";
import { ArrowLeftIcon } from "@heroicons/react/20/solid";
import { useNews, useNewsArticle } from "@/api/endpoints";
import { ErrorCard, Spinner } from "@/components/states";
import { sanitizeAnnouncementHtml } from "@/features/announcements/announcement-utils";
import { NewsPosterViewer } from "../components/NewsPosterViewer";
import { NewsSidebar } from "../components/NewsSidebar";

export function StudentNewsDetailPage() {
  const { id } = useParams();
  const articleQuery = useNewsArticle(id ?? null);
  const listQuery = useNews();

  const news = articleQuery.data?.news;
  const isPublished = Boolean(news && news.status === "published");
  const relatedNews = (listQuery.data?.items ?? []).filter(
    (item) => item.status === "published" && item.id !== id,
  );

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-6 py-8 md:px-16 xl:px-32">
        <Link
          to="/news"
          className="inline-flex w-fit items-center gap-1 font-body text-body-md-emphasize text-grey-900 hover:text-grey-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        >
          <ArrowLeftIcon className="size-5" aria-hidden="true" />
          Back
        </Link>

        <h1 className="font-body text-header-sm-emphasize text-grey-900">
          รายละเอียดข่าวประชาสัมพันธ์
        </h1>

        {!id && <ErrorCard message="ไม่พบรหัสข่าว" />}

        {id && articleQuery.isPending && (
          <div className="flex justify-center py-12" role="status" aria-label="กำลังโหลด">
            <Spinner />
          </div>
        )}

        {id && !articleQuery.isPending && (articleQuery.error || !news) && (
          <ErrorCard
            message={
              articleQuery.error instanceof Error
                ? articleQuery.error.message
                : "โหลดข่าวไม่สำเร็จ"
            }
            onRetry={() => void articleQuery.refetch()}
          />
        )}

        {id && !articleQuery.isPending && news && !isPublished && (
          <ErrorCard message="ไม่พบข่าวที่ต้องการ" />
        )}

        {id && !articleQuery.isPending && news && isPublished && (
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_212px]">
            <article className="flex min-w-0 flex-col gap-6 rounded-xl border border-grey-200 bg-surface p-6">
              <h2 className="font-body text-header-xs-emphasize text-grey-900">
                {news.title}
              </h2>
              <NewsPosterViewer newsId={news.id} images={news.images} />
              <div
                className="announcement-rich-content font-body text-body-md text-grey-700"
                dangerouslySetInnerHTML={{ __html: sanitizeAnnouncementHtml(news.content) }}
              />
            </article>

            <NewsSidebar
              items={relatedNews}
              isLoading={listQuery.isPending}
              error={listQuery.error}
              onRetry={() => void listQuery.refetch()}
              emptyMessage="ยังไม่มีข่าวอื่น"
            />
          </div>
        )}
      </div>
    </div>
  );
}
