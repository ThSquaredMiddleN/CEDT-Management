import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PlusIcon } from "@heroicons/react/24/outline";
import { useNews } from "@/api/endpoints";
import type { NewsArticle, NewsTag } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorCard, Spinner } from "@/components/states";
import {
  NEWS_TAGS,
  newsDate,
  newsImageUrl,
  newsPlainText,
  newsTagClassName,
  newsTagLabel,
} from "../news-utils";

type NewsFilter = NewsTag | "all";

function NewsCard({ news, draft = false }: { news: NewsArticle; draft?: boolean }) {
  const cover = news.images[0];
  const date = news.publishedAt ?? news.updatedAt;

  return (
    <Link
      to={`/admin/news/${news.id}`}
      className="flex min-w-0 gap-4 rounded-xl border border-neutral-200 bg-white p-4 transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
    >
      {cover && (
        <div className="w-16 shrink-0 overflow-hidden rounded border border-grey-200 bg-grey-100 sm:w-20">
          <div className="aspect-[210/297]">
            <img
              src={newsImageUrl(news.id, cover.id)}
              alt={`โปสเตอร์: ${cover.originalName}`}
              className="size-full object-contain"
            />
          </div>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="min-w-0 flex-1 font-body text-body-sm-emphasize text-brand-primary">
            {news.title}
          </h3>
          {draft && (
            <Badge
              variant="secondary"
              className="shrink-0 rounded-full border-transparent bg-grey-100 font-body text-body-xs text-grey-700"
            >
              ฉบับร่าง
            </Badge>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {news.tags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className={`rounded-full px-2 py-0.5 font-body text-body-xs ${newsTagClassName(tag)}`}
            >
              {newsTagLabel(tag)}
            </Badge>
          ))}
        </div>
        <p className="mt-2 line-clamp-2 font-body text-body-xs text-grey-400">
          {newsPlainText(news.content)}
        </p>
        <time dateTime={date} className="mt-2 block font-body text-body-xs text-grey-400">
          {draft ? "บันทึกล่าสุด " : ""}{newsDate(date)}
        </time>
      </div>
    </Link>
  );
}

export function NewsListPage() {
  const [filter, setFilter] = useState<NewsFilter>("all");
  const query = useNews();
  const items = query.data?.items ?? [];
  const drafts = items.filter((news) => news.status === "draft");
  const published = useMemo(
    () =>
      items.filter(
        (news) =>
          news.status === "published" &&
          (filter === "all" || news.tags.includes(filter)),
      ),
    [items, filter],
  );

  return (
    <div className="w-full px-4 py-6 md:px-8 lg:px-16 lg:py-8">
      <h1 className="font-body text-header-sm-emphasize text-grey-900">
        จัดการข่าวประชาสัมพันธ์
      </h1>
      <div className="mt-6 grid min-w-0 grid-cols-1 items-start gap-8 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section aria-labelledby="news-drafts-title" className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <h2
              id="news-drafts-title"
              className="font-body text-header-xs-emphasize text-grey-900"
            >
              ร่างข่าว
            </h2>
            <Badge variant="secondary" className="rounded-full border-transparent bg-grey-100">
              {query.isPending ? "…" : drafts.length}
            </Badge>
          </div>
          <Button asChild variant="filled" size="medium" className="mt-3 w-full">
            <Link to="/admin/news/create">
              เพิ่มข่าวใหม่
              <PlusIcon className="size-[14px]" aria-hidden="true" />
            </Link>
          </Button>
          <div className="mt-3 space-y-3">
            {query.isPending && (
              <div className="flex justify-center py-8" role="status" aria-label="กำลังโหลด">
                <Spinner />
              </div>
            )}
            {query.error && (
              <ErrorCard
                message={query.error instanceof Error ? query.error.message : "โหลดข่าวไม่สำเร็จ"}
                onRetry={() => void query.refetch()}
              />
            )}
            {!query.isPending && !query.error && drafts.length === 0 && (
              <EmptyState title="ยังไม่มีร่างข่าว" />
            )}
            {drafts.map((news) => (
              <NewsCard key={news.id} news={news} draft />
            ))}
          </div>
        </section>

        <section aria-labelledby="news-list-title" className="min-w-0">
          <div className="flex flex-col gap-3">
            <h2 id="news-list-title" className="font-body text-header-xs-emphasize text-grey-900">
              ข่าวประชาสัมพันธ์
            </h2>
            <div
              className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-grey-100 p-[3px]"
              role="group"
              aria-label="กรองข่าวตามแท็ก"
            >
              {[{ value: "all" as const, label: "All" }, ...NEWS_TAGS].map(
                ({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value)}
                    className={
                      filter === value
                        ? "h-[30px] shrink-0 rounded-md bg-white px-3 font-body text-body-xs text-grey-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                        : "h-[30px] shrink-0 rounded-md px-3 font-body text-body-xs text-grey-400 hover:text-grey-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                    }
                  >
                    {label}
                  </button>
                ),
              )}
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {query.isPending && (
              <div className="flex justify-center py-8" role="status" aria-label="กำลังโหลด">
                <Spinner />
              </div>
            )}
            {query.error && (
              <ErrorCard
                message={query.error instanceof Error ? query.error.message : "โหลดข่าวไม่สำเร็จ"}
                onRetry={() => void query.refetch()}
              />
            )}
            {!query.isPending && !query.error && items.length === 0 && (
              <EmptyState title="ยังไม่มีข่าวประชาสัมพันธ์" />
            )}
            {!query.isPending && !query.error && items.length > 0 && published.length === 0 && (
              <EmptyState
                title={
                  filter === "all"
                    ? "ยังไม่มีข่าวที่เผยแพร่"
                    : `ไม่พบข่าวในแท็ก ${newsTagLabel(filter)}`
                }
              />
            )}
            {published.map((news) => (
              <NewsCard key={news.id} news={news} />
            ))}
            {query.isFetching && !query.isPending && (
              <span className="sr-only" role="status">
                กำลังอัปเดตรายการข่าว
              </span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
