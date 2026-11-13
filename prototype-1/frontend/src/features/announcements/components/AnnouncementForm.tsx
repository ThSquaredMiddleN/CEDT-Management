import { useState, type FormEvent } from "react";
import type { Announcement, AnnouncementInput } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  announcementPlainText,
  normalizeAnnouncementAudiences,
  type AnnouncementYearAudience,
} from "../announcement-utils";
import { AnnouncementEditor } from "./AnnouncementEditor";
import { AudienceCheckboxes } from "./AudienceCheckboxes";

export function AnnouncementForm({
  announcement,
  onSave,
  onCancel,
  saving,
}: {
  announcement?: Announcement;
  onSave: (value: AnnouncementInput) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState(announcement?.title ?? "");
  const [content, setContent] = useState(announcement?.content ?? "");
  const [audiences, setAudiences] = useState<AnnouncementYearAudience[]>(
    () => normalizeAnnouncementAudiences(announcement?.audiences),
  );
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("กรุณาระบุหัวข้อประกาศ");
      return;
    }
    if (!announcementPlainText(content)) {
      setError("กรุณาระบุรายละเอียดประกาศ");
      return;
    }
    if (audiences.length === 0) {
      setError("กรุณาเลือกกลุ่มผู้รับอย่างน้อยหนึ่งรายการ");
      return;
    }

    try {
      await onSave({ title: title.trim(), content, audiences });
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "บันทึกประกาศไม่สำเร็จ กรุณาลองอีกครั้ง",
      );
    }
  };

  return (
    <div className="w-full px-4 py-6 md:px-8 lg:px-16 lg:py-8">
      <h1 className="font-body text-header-sm-emphasize text-grey-900">
        {announcement ? "แก้ไขประกาศ" : "เพิ่มประกาศใหม่"}
      </h1>
      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <form className="min-w-0 space-y-8" onSubmit={(event) => void submit(event)}>
          <div className="space-y-2">
            <label
              htmlFor="announcement-title"
              className="font-body text-body-md-emphasize text-brand-primary"
            >
              หัวข้อ
            </label>
            <Input
              id="announcement-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              required
              aria-invalid={Boolean(error && !title.trim())}
              className="h-8 rounded-md px-3 text-body-sm shadow-sm placeholder:text-grey-200"
              placeholder="หัวข้อ"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="announcement-content"
              className="font-body text-body-md-emphasize text-brand-primary"
            >
              รายละเอียดประกาศ
            </label>
            <AnnouncementEditor
              key={announcement?.id ?? "new-announcement"}
              id="announcement-content"
              initialContent={content}
              onChange={setContent}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              variant="outlined"
              size="medium"
              className="w-full flex-1"
              onClick={onCancel}
            >
              ยกเลิก
            </Button>
            <Button
              type="submit"
              variant="filled"
              size="medium"
              className="w-full flex-1"
              loading={saving}
            >
              บันทึก
            </Button>
          </div>
          {error && (
            <p className="font-body text-body-sm text-grey-900" role="alert">
              {error}
            </p>
          )}
        </form>

        <div className="min-w-0">
          <AudienceCheckboxes value={audiences} onChange={setAudiences} />
          {audiences.length === 0 && (
            <p className="mt-2 font-body text-body-xs text-grey-900" role="alert">
              เลือกผู้รับอย่างน้อยหนึ่งกลุ่ม
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
