import { useState, type FormEvent } from "react";
import { ArrowLeftIcon } from "@heroicons/react/20/solid";
import type { NewsArticle, NewsInput } from "@/api/types";
import { useToast } from "@/app/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  announcementPlainText,
} from "@/features/announcements/announcement-utils";
import { AnnouncementEditor } from "@/features/announcements/components/AnnouncementEditor";
import { NewsPosterField } from "./NewsPosterField";
import { NewsTagsField } from "./NewsTagsField";

export function NewsForm({
  news,
  onSave,
  onCancel,
  onRemoveImage,
  saving,
}: {
  news?: NewsArticle;
  onSave: (value: NewsInput, files: File[]) => Promise<void>;
  onCancel: () => void;
  onRemoveImage?: (imageId: string) => Promise<void>;
  saving: boolean;
}) {
  const toast = useToast();
  const [title, setTitle] = useState(news?.title ?? "");
  const [content, setContent] = useState(news?.content ?? "");
  const [tags, setTags] = useState(news?.tags ?? []);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [removingImageId, setRemovingImageId] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("กรุณาระบุหัวข้อข่าว");
      return;
    }
    if (!announcementPlainText(content)) {
      setError("กรุณาระบุรายละเอียดข่าว");
      return;
    }

    try {
      await onSave({ title: title.trim(), content, tags }, files);
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : "บันทึกข่าวไม่สำเร็จ กรุณาลองอีกครั้ง";
      setError(message);
      toast(
        message.startsWith("ข้อมูลข่าวบันทึกแล้ว")
          ? message
          : `บันทึกข่าวไม่สำเร็จ: ${message}`,
      );
    }
  };

  const removeImage = async (imageId: string) => {
    if (!onRemoveImage) return;
    setRemovingImageId(imageId);
    try {
      await onRemoveImage(imageId);
      toast("ลบโปสเตอร์เรียบร้อยแล้ว");
    } catch (removeError) {
      const message =
        removeError instanceof Error ? removeError.message : "ไม่สามารถลบโปสเตอร์ได้";
      toast(`ลบโปสเตอร์ไม่สำเร็จ: ${message}`);
    } finally {
      setRemovingImageId(null);
    }
  };

  return (
    <div className="w-full px-4 py-6 md:px-8 lg:px-16 lg:py-8">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mb-4"
        onClick={onCancel}
      >
        <ArrowLeftIcon className="size-4" aria-hidden="true" />
        กลับ
      </Button>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-body text-header-sm-emphasize text-grey-900">
          {news ? "แก้ไขข่าวประชาสัมพันธ์" : "เพิ่มข่าวประชาสัมพันธ์"}
        </h1>
        {news?.status === "draft" && (
          <span className="rounded-full bg-grey-100 px-3 py-1 font-body text-body-xs text-grey-700">
            ฉบับร่าง
          </span>
        )}
      </div>
      <form
        className="mt-6 grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]"
        onSubmit={(event) => void submit(event)}
      >
        <div className="min-w-0 space-y-7">
          <div className="space-y-2">
            <label
              htmlFor="news-title"
              className="font-body text-body-md-emphasize text-brand-primary"
            >
              หัวข้อข่าว
            </label>
            <Input
              id="news-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              required
              disabled={saving}
              aria-invalid={Boolean(error && !title.trim())}
              className="h-10 rounded-md px-3 font-body text-body-sm shadow-sm placeholder:text-grey-200"
              placeholder="ระบุหัวข้อข่าวประชาสัมพันธ์"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="news-content"
              className="font-body text-body-md-emphasize text-brand-primary"
            >
              รายละเอียดข่าว
            </label>
            <AnnouncementEditor
              key={news?.id ?? "new-news"}
              id="news-content"
              ariaLabel="รายละเอียดข่าว"
              placeholder="รายละเอียดข่าวประชาสัมพันธ์"
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
              disabled={saving}
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
              {news ? "บันทึกการแก้ไข" : "บันทึกฉบับร่าง"}
            </Button>
          </div>
          {error && (
            <p className="font-body text-body-sm text-grey-900" role="alert">
              {error}
            </p>
          )}
        </div>

        <aside className="min-w-0 space-y-7">
          <NewsTagsField value={tags} onChange={setTags} />
          <NewsPosterField
            newsId={news?.id}
            images={news?.images ?? []}
            pendingFiles={files}
            disabled={saving || removingImageId !== null}
            onAddFiles={(selected) => setFiles((current) => [...current, ...selected])}
            onInvalid={(message) => toast(message)}
            onRemoveImage={onRemoveImage ? (imageId) => void removeImage(imageId) : undefined}
            onRemoveFile={(index) =>
              setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))
            }
          />
        </aside>
      </form>
    </div>
  );
}
