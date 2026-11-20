import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpTrayIcon, PhotoIcon, XMarkIcon } from "@heroicons/react/24/outline";
import type { NewsImage } from "@/api/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NewsImageView } from "./NewsImageView";
import {
  MAX_NEWS_IMAGE_BYTES,
  MAX_NEWS_IMAGES,
} from "../news-utils";

interface PosterItem {
  key: string;
  name: string;
  src?: string;
  imageId?: string;
  fileIndex?: number;
}

function PosterImage({
  item,
  newsId,
  alt,
}: {
  item: PosterItem;
  newsId?: string;
  alt: string;
}) {
  if (item.imageId && newsId) {
    return (
      <NewsImageView
        newsId={newsId}
        imageId={item.imageId}
        alt={alt}
        className="size-full object-contain"
      />
    );
  }
  return <img src={item.src} alt={alt} className="size-full object-contain" />;
}

export function NewsPosterField({
  newsId,
  images,
  pendingFiles,
  disabled,
  onAddFiles,
  onInvalid,
  onRemoveImage,
  onRemoveFile,
}: {
  newsId?: string;
  images: NewsImage[];
  pendingFiles: File[];
  disabled?: boolean;
  onAddFiles: (files: File[]) => void;
  onInvalid: (message: string) => void;
  onRemoveImage?: (imageId: string) => void;
  onRemoveFile: (index: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const pendingUrls = useMemo(
    () => pendingFiles.map((file) => URL.createObjectURL(file)),
    [pendingFiles],
  );
  useEffect(() => () => pendingUrls.forEach((url) => URL.revokeObjectURL(url)), [pendingUrls]);

  const items: PosterItem[] = [
    ...images.map((image) => ({
      key: image.id,
      imageId: image.id,
      name: image.originalName,
    })),
    ...pendingFiles.map((file, fileIndex) => ({
      key: `pending-${fileIndex}-${file.name}`,
      fileIndex,
      name: file.name,
      src: pendingUrls[fileIndex] ?? "",
    })),
  ];

  const acceptFiles = (files: FileList | File[]) => {
    const selected = Array.from(files);
    if (items.length + selected.length > MAX_NEWS_IMAGES) {
      onInvalid(`เพิ่มรูปได้สูงสุด ${MAX_NEWS_IMAGES} รูป`);
      return;
    }
    if (selected.some((file) => !["image/jpeg", "image/png"].includes(file.type))) {
      onInvalid("รองรับเฉพาะไฟล์ JPG และ PNG");
      return;
    }
    if (selected.some((file) => file.size === 0 || file.size > MAX_NEWS_IMAGE_BYTES)) {
      onInvalid("ไฟล์ต้องมีขนาดมากกว่า 0 และไม่เกิน 10 MB");
      return;
    }
    if (selected.length > 0) onAddFiles(selected);
  };

  const uploadButton = (
    <Button
      type="button"
      variant="outlined"
      size="small"
      disabled={disabled || items.length >= MAX_NEWS_IMAGES}
      onClick={() => inputRef.current?.click()}
    >
      <ArrowUpTrayIcon className="size-4" aria-hidden="true" />
      {items.length > 0 ? "เพิ่มโปสเตอร์" : "เลือกไฟล์"}
    </Button>
  );

  return (
    <section className="space-y-2" aria-labelledby="news-poster-label">
      <h2
        id="news-poster-label"
        className="font-body text-body-md-emphasize text-brand-primary"
      >
        โปสเตอร์
      </h2>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        multiple
        className="sr-only"
        aria-label="เลือกโปสเตอร์ JPG หรือ PNG"
        onChange={(event) => {
          if (event.currentTarget.files) acceptFiles(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
      <div
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (
            !(event.relatedTarget instanceof Node) ||
            !event.currentTarget.contains(event.relatedTarget)
          ) {
            setDragging(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          acceptFiles(event.dataTransfer.files);
        }}
        className={cn(
          "rounded-xl border border-dashed border-grey-200 bg-white p-4",
          dragging && "border-brand-primary bg-brand-primary-hover",
        )}
      >
        {items.length === 0 ? (
          <div className="flex min-h-36 flex-col items-center justify-center gap-3 text-center">
            <PhotoIcon className="size-8 text-grey-400" aria-hidden="true" />
            <p className="font-body text-body-sm text-grey-700">
              ลากไฟล์โปสเตอร์มาวางที่นี่ หรือเลือกไฟล์จากอุปกรณ์
            </p>
            {uploadButton}
          </div>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="relative w-36 shrink-0 overflow-hidden rounded-md border border-grey-200 bg-grey-100 sm:w-44">
              <div className="aspect-[210/297]">
                {items[0] && (
                  <PosterImage
                    item={items[0]}
                    newsId={newsId}
                    alt={`โปสเตอร์ปก: ${items[0].name}`}
                  />
                )}
              </div>
              <span className="absolute left-2 top-2 rounded bg-white/90 px-2 py-1 font-body text-body-xs text-grey-700">
                รูปปก
              </span>
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <p className="break-all font-body text-body-sm-emphasize text-grey-700">
                {items[0]?.name}
              </p>
              <p className="font-body text-body-xs text-grey-400">
                {items.length} / {MAX_NEWS_IMAGES} รูป
              </p>
              {uploadButton}
              <div
                className="flex max-w-full gap-2 overflow-x-auto py-1"
                role="group"
                aria-label="โปสเตอร์ทั้งหมด"
              >
                {items.map((item, index) => (
                  <div
                    key={item.key}
                    className="relative w-14 shrink-0 overflow-hidden rounded border border-grey-200 bg-white"
                  >
                    <div className="aspect-[210/297]">
                      <PosterImage
                        item={item}
                        newsId={newsId}
                        alt={`โปสเตอร์ ${index + 1}: ${item.name}`}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={disabled}
                      aria-label={`ลบโปสเตอร์ ${index + 1}: ${item.name}`}
                      onClick={() =>
                        item.imageId && onRemoveImage
                          ? onRemoveImage(item.imageId)
                          : item.fileIndex !== undefined && onRemoveFile(item.fileIndex)
                      }
                      className="absolute right-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-white/95 text-grey-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary disabled:opacity-50"
                    >
                      <XMarkIcon className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      <p className="font-body text-body-xs text-grey-400">
        รองรับ JPG, PNG ขนาดไม่เกิน 10 MB ต่อไฟล์ สูงสุด {MAX_NEWS_IMAGES} รูป และแสดงโปสเตอร์แนวตั้ง A4 (210:297)
      </p>
    </section>
  );
}
