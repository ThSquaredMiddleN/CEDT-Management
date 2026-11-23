import { Link } from "react-router-dom";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import type { NewsArticle } from "@/api/types";
import { Button } from "@/components/ui/button";
import { newsDate, newsImageUrl, newsTagLabel } from "../news-utils";

interface StudentNewsCardProps {
  news: NewsArticle;
}

export function StudentNewsCard({ news }: StudentNewsCardProps) {
  const cover = news.images[0];
  const firstTag = news.tags[0];
  const date = news.publishedAt ?? news.updatedAt;

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-grey-200 bg-surface sm:flex-row sm:items-center">
      <div className="h-44 w-full shrink-0 overflow-hidden bg-grey-100 sm:h-[120px] sm:w-[210px]">
        {cover ? (
          <img
            src={newsImageUrl(news.id, cover.id)}
            alt={`โปสเตอร์: ${cover.originalName}`}
            className="size-full object-cover"
          />
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2.5 px-5 py-4">
        <h2 className="line-clamp-1 font-body text-header-xxs-emphasize text-grey-900">
          {news.title}
        </h2>
        <div className="flex flex-wrap items-center gap-4 font-body text-body-xs-emphasize">
          {firstTag && (
            <span className="text-brand-primary">{newsTagLabel(firstTag)}</span>
          )}
          <time dateTime={date} className="text-grey-700">
            {newsDate(date)}
          </time>
        </div>
        <Button
          asChild
          variant="ghost-primary"
          size="small"
          icon={<ArrowRightIcon />}
          className="h-auto px-0 py-1"
        >
          <Link to={`/news/${news.id}`}>อ่านเพิ่มเติม</Link>
        </Button>
      </div>
    </article>
  );
}
