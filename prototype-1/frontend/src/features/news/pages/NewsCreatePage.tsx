import { useNavigate } from "react-router-dom";
import { useCreateNews } from "@/api/endpoints";
import { useToast } from "@/app/toast";
import { NewsForm } from "../components/NewsForm";

export function NewsCreatePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const createNews = useCreateNews();

  return (
    <NewsForm
      onSave={async (value, files) => {
        const body = new FormData();
        body.set("title", value.title);
        body.set("content", value.content);
        body.set("tags", JSON.stringify(value.tags));
        files.forEach((file) => body.append("images", file));
        await createNews.mutateAsync(body);
        toast("บันทึกฉบับร่างข่าวเรียบร้อยแล้ว");
        navigate("/admin/news");
      }}
      onCancel={() => navigate("/admin/news")}
      saving={createNews.isPending}
    />
  );
}
