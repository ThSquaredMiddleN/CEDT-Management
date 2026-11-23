import { Link } from "react-router-dom";
import type { NewsArticle } from "@/api/types";
import { EmptyState, ErrorCard, Spinner } from "@/components/states";
import {
  newsDate,
  newsImageUrl,
  newsSidebarTagClassName,
  newsTagLabel,
} from "../news-utils";

interface NewsSidebarProps {
  items: NewsArticle[];
  headingTo?: string;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyMessage?: string;
}

export function NewsSidebar({
  items,
  headingTo,
  isLoading = false,
  error,
  onRetry,
  emptyMessage = "ยังไม่มีข่าวประชาสัมพันธ์",
}: NewsSidebarProps) {
  const visibleItems = items.slice(0, 2);

  return (
    <aside aria-labelledby="news-sidebar-title" className="flex w-full shrink-0 flex-col gap-2.5 lg:w-[212px]">
      {headingTo ? (
        <Link
          to={headingTo}
          id="news-sidebar-title"
          className="w-fit font-body text-header-xxs-emphasize text-grey-900 transition-colors hover:text-brand-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        >
          ข่าวประชาสัมพันธ์
        </Link>
      ) : (
        <h2 id="news-sidebar-title" className="font-body text-header-xxs-emphasize text-grey-900">
          ข่าวประชาสัมพันธ์
        </h2>
      )}

      {isLoading && (
        <div className="flex justify-center py-8" role="status" aria-label="กำลังโหลด">
          <Spinner />
        </div>
      )}

      {!isLoading && Boolean(error) && (
        <ErrorCard
          message={error instanceof Error ? error.message : "โหลดข่าวไม่สำเร็จ"}
          onRetry={onRetry}
        />
      )}

      {!isLoading && !error && visibleItems.length === 0 && (
        <EmptyState title={emptyMessage} />
      )}

      {!isLoading && !error && visibleItems.length > 0 && (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-1">
          {visibleItems.map((news) => {
            const cover = news.images[0];
            const firstTag = news.tags[0];
            const date = news.publishedAt ?? news.updatedAt;

            return (
              <Link
                key={news.id}
                to={`/news/${news.id}`}
                className="group block overflow-hidden rounded-xl border border-neutral-200 bg-white transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
              >
                <div className="h-[240px] w-full overflow-hidden bg-grey-100">
                  {cover ? (
                    <img
                      src={newsImageUrl(news.id, cover.id)}
                      alt={news.title}
                      className="size-full object-cover transition-transform group-hover:scale-[1.02]"
                    />
                  ) : null}
                </div>
                <div className="flex flex-col gap-1 px-4 py-3">
                  <div className="flex items-center gap-2">
                    {firstTag && (
                      <span
                        className={`rounded px-1.5 py-0.5 font-body text-[10px] font-semibold leading-[15px] ${newsSidebarTagClassName(firstTag)}`}
                      >
                        {newsTagLabel(firstTag)}
                      </span>
                    )}
                    <time dateTime={date} className="font-body text-[11px] text-grey-400">
                      {newsDate(date)}
                    </time>
                  </div>
                  <p className="truncate font-body text-[13px] font-semibold leading-[1.4] text-grey-900">
                    {news.title}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </aside>
  );
}
