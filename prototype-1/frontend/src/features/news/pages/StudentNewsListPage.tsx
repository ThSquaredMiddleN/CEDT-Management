import { Link } from "react-router-dom";
import { ArrowLeftIcon } from "@heroicons/react/20/solid";
import { useNews } from "@/api/endpoints";
import { EmptyState, ErrorCard, Spinner } from "@/components/states";
import { StudentNewsCard } from "../components/StudentNewsCard";

export function StudentNewsListPage() {
  const { data, error, isPending, refetch, isFetching } = useNews();
  const published = (data?.items ?? []).filter((news) => news.status === "published");

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-3 px-6 py-8 md:px-16 xl:px-32">
        <Link
          to="/"
          className="inline-flex w-fit items-center gap-1 font-body text-body-md-emphasize text-grey-900 hover:text-grey-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        >
          <ArrowLeftIcon className="size-5" aria-hidden="true" />
          Back
        </Link>

        <header className="flex flex-col gap-2 pb-2">
          <h1 className="font-body text-header-sm-emphasize text-grey-900">
            ข่าวประชาสัมพันธ์
          </h1>
          <p className="font-body text-body-md text-grey-700">
            กิจกรรมและโอกาสสำหรับนิสิต CEDT
          </p>
        </header>

        <section aria-label="รายการข่าวประชาสัมพันธ์" className="flex flex-col gap-3">
          {isPending && (
            <div className="flex justify-center py-12" role="status" aria-label="กำลังโหลด">
              <Spinner />
            </div>
          )}
          {error && (
            <ErrorCard
              message={error instanceof Error ? error.message : "โหลดข่าวไม่สำเร็จ"}
              onRetry={() => void refetch()}
            />
          )}
          {!isPending && !error && published.length === 0 && (
            <EmptyState title="ยังไม่มีข่าวประชาสัมพันธ์ที่เผยแพร่" />
          )}
          {published.map((news) => (
            <StudentNewsCard key={news.id} news={news} />
          ))}
          {isFetching && !isPending && (
            <span className="sr-only" role="status">
              กำลังอัปเดตรายการข่าว
            </span>
          )}
        </section>
      </div>
    </div>
  );
}
