import { useNavigate } from "react-router-dom";
import { useCreateAnnouncement } from "@/api/endpoints";
import { useToast } from "@/app/toast";
import { AnnouncementForm } from "../components/AnnouncementForm";

export function AnnouncementCreatePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const createAnnouncement = useCreateAnnouncement();

  return (
    <AnnouncementForm
      onSave={async (value) => {
        await createAnnouncement.mutateAsync(value);
        toast("บันทึกฉบับร่างเรียบร้อยแล้ว");
        navigate("/admin/announcements");
      }}
      onCancel={() => navigate("/admin/announcements")}
      saving={createAnnouncement.isPending}
    />
  );
}
