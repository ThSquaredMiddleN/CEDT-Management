import { Link, useParams } from "react-router-dom";
import { ArrowLeftIcon } from "@heroicons/react/20/solid";
import {
  useNewsArticle,
  usePublishNews,
} from "@/api/endpoints";
import { useToast } from "@/app/toast";
import type { NewsArticle } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorCard, Spinner } from "@/components/states";
import {
  newsDate,
  newsTagClassName,
  newsTagLabel,
} from "../news-utils";
import { NewsPosterViewer } from "../components/NewsPosterViewer";
import { sanitizeAnnouncementHtml } from "@/features/announcements/announcement-utils";

function NewsArticleView({ news }: { news: NewsArticle }) {
  const date = news.publishedAt ?? news.updatedAt;

  return (
    <article className="rounded-xl border border-neutral-200 bg-white px-5 py-5 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <time dateTime={date} className="font-body text-body-xs-emphasize text-grey-400">
          {newsDate(date)}
        </time>
        <Badge
          variant="secondary"
          className="rounded-full border-transparent bg-grey-100 font-body text-body-xs text-grey-700"
        >
          {news.status === "draft" ? "ฉบับร่าง" : "เผยแพร่แล้ว"}
        </Badge>
      </div>
      <h1 className="mt-4 font-body text-header-xs-emphasize text-brand-primary">
        {news.title}
      </h1>
      <div className="mt-4 flex flex-wrap gap-2">
        {news.tags.map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className={`rounded-full font-body text-body-xs ${newsTagClassName(tag)}`}
          >
            {newsTagLabel(tag)}
          </Badge>
        ))}
      </div>

      <NewsPosterViewer newsId={news.id} images={news.images} className="mt-6" />

      <hr className="my-6 border-neutral-200" />
      <div
        className="announcement-rich-content font-body text-body-md text-grey-700"
        dangerouslySetInnerHTML={{ __html: sanitizeAnnouncementHtml(news.content) }}
      />
    </article>
  );
}

export function NewsDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const query = useNewsArticle(id ?? null);
  const publishNews = usePublishNews(id ?? "");

  if (!id) return <ErrorCard message="ไม่พบรหัสข่าว" />;
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
          <Link to="/admin/news">
            <ArrowLeftIcon className="size-4" aria-hidden="true" />
            กลับ
          </Link>
        </Button>
        <ErrorCard
          message={query.error instanceof Error ? query.error.message : "โหลดข่าวไม่สำเร็จ"}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  const news = query.data.news;
  const publish = async () => {
    try {
      await publishNews.mutateAsync(undefined);
      toast("เผยแพร่ข่าวเรียบร้อยแล้ว");
      await query.refetch();
    } catch (error) {
      toast(
        `เผยแพร่ข่าวไม่สำเร็จ: ${
          error instanceof Error ? error.message : "กรุณาลองอีกครั้ง"
        }`,
      );
    }
  };

  return (
    <div className="mx-auto w-full max-w-[963px] px-4 py-6 md:px-0 lg:py-8">
      <Link
        to="/admin/news"
        className="inline-flex items-center gap-1 font-body text-body-sm-emphasize text-grey-900 hover:text-grey-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
      >
        <ArrowLeftIcon className="size-5" aria-hidden="true" />
        กลับไปรายการข่าว
      </Link>
      <div className="mt-6">
        <NewsArticleView news={news} />
      </div>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button asChild variant="outlined" size="medium">
          <Link to={`/admin/news/${id}/edit`}>แก้ไข</Link>
        </Button>
        {news.status === "draft" && (
          <Button
            variant="filled"
            size="medium"
            loading={publishNews.isPending}
            onClick={() => void publish()}
          >
            เผยแพร่ข่าว
          </Button>
        )}
      </div>
    </div>
  );
}
