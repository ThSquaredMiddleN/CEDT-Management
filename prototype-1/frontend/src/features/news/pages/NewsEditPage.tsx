import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeftIcon } from "@heroicons/react/20/solid";
import {
  useNewsArticle,
  useRemoveNewsImage,
  useUpdateNews,
  useUploadNewsImages,
} from "@/api/endpoints";
import { useToast } from "@/app/toast";
import { Button } from "@/components/ui/button";
import { ErrorCard, Spinner } from "@/components/states";
import { NewsForm } from "../components/NewsForm";

export function NewsEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const query = useNewsArticle(id ?? null);
  const updateNews = useUpdateNews(id ?? "");
  const uploadImages = useUploadNewsImages(id ?? "");
  const removeImage = useRemoveNewsImage(id ?? "");

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
          <Link to={`/admin/news/${id}`}>
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

  return (
    <NewsForm
      news={query.data.news}
      onSave={async (value, files) => {
        await updateNews.mutateAsync(value);
        if (files.length > 0) {
          const body = new FormData();
          files.forEach((file) => body.append("images", file));
          try {
            await uploadImages.mutateAsync(body);
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "กรุณาลองอีกครั้ง";
            throw new Error(`ข้อมูลข่าวบันทึกแล้ว แต่เพิ่มโปสเตอร์ไม่สำเร็จ: ${message}`);
          }
        }
        toast("แก้ไขข่าวเรียบร้อยแล้ว");
        navigate(`/admin/news/${id}`);
      }}
      onCancel={() => navigate(`/admin/news/${id}`)}
      onRemoveImage={(imageId) => removeImage.mutateAsync(imageId).then(() => undefined)}
      saving={updateNews.isPending || uploadImages.isPending}
    />
  );
}
