import { useNavigate } from "react-router-dom";
import { useCreateAnnouncement } from "@/api/endpoints";
import { AnnouncementForm } from "../components/AnnouncementForm";

export function AnnouncementCreatePage() {
  const navigate = useNavigate();
  const createAnnouncement = useCreateAnnouncement();

  return (
    <AnnouncementForm
      onSave={async (value) => {
        await createAnnouncement.mutateAsync(value);
        navigate("/admin/announcements", { state: "announcement-created" });
      }}
      onCancel={() => navigate("/admin/announcements")}
      saving={createAnnouncement.isPending}
    />
  );
}
