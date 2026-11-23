import { useNavigate, useParams } from "react-router-dom";
import { useAnnouncement, useUpdateAnnouncement } from "@/api/endpoints";
import { useToast } from "@/app/toast";
import { Button } from "@/components/ui/button";
import { ErrorCard, Spinner } from "@/components/states";
import { AnnouncementForm } from "../components/AnnouncementForm";

export function AnnouncementEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const query = useAnnouncement(id ?? null);
  const updateAnnouncement = useUpdateAnnouncement(id ?? "");

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
      <div className="mx-auto max-w-[1092px] px-4 py-8 md:px-8 lg:px-16">
        <ErrorCard
          message={query.error instanceof Error ? query.error.message : "โหลดประกาศไม่สำเร็จ"}
          onRetry={() => void query.refetch()}
        />
        <Button
          variant="outlined"
          size="medium"
          className="mt-4"
          onClick={() => navigate("/admin/announcements")}
        >
          กลับไปหน้ารายการ
        </Button>
      </div>
    );
  }

  return (
    <AnnouncementForm
      key={query.data.announcement.id}
      announcement={query.data.announcement}
      onSave={async (value) => {
        await updateAnnouncement.mutateAsync(value);
        toast("แก้ไขประกาศเรียบร้อยแล้ว");
        navigate(`/admin/announcements/${id}`);
      }}
      onCancel={() => navigate(`/admin/announcements/${id}`)}
      saving={updateAnnouncement.isPending}
    />
  );
}
