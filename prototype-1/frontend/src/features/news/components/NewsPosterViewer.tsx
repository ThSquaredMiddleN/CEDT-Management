import { useState } from "react";
import type { NewsImage } from "@/api/types";
import { cn } from "@/lib/utils";
import { newsImageUrl } from "../news-utils";

interface NewsPosterViewerProps {
  newsId: string;
  images: NewsImage[];
  className?: string;
}

export function NewsPosterViewer({ newsId, images, className }: NewsPosterViewerProps) {
  const [selectedImageId, setSelectedImageId] = useState(images[0]?.id ?? null);
  const selectedImage = images.find((image) => image.id === selectedImageId) ?? images[0];

  if (!selectedImage) return null;

  return (
    <section className={cn(className)} aria-label="โปสเตอร์ข่าว">
      <div className="mx-auto max-w-[min(100%,420px)] overflow-hidden rounded-lg border border-grey-200 bg-grey-100">
        <div className="aspect-[210/297]">
          <img
            src={newsImageUrl(newsId, selectedImage.id)}
            alt={`โปสเตอร์ข่าว: ${selectedImage.originalName}`}
            className="size-full object-contain"
          />
        </div>
      </div>
      {images.length > 1 && (
        <div
          className="mx-auto mt-3 flex max-w-full gap-2 overflow-x-auto py-1"
          role="group"
          aria-label="เลือกโปสเตอร์"
        >
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              aria-label={`แสดงโปสเตอร์ ${index + 1}: ${image.originalName}`}
              aria-pressed={selectedImage.id === image.id}
              onClick={() => setSelectedImageId(image.id)}
              className={`w-14 shrink-0 overflow-hidden rounded border bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary ${
                selectedImage.id === image.id ? "border-brand-primary" : "border-grey-200"
              }`}
            >
              <span className="aspect-[210/297] block">
                <img
                  src={newsImageUrl(newsId, image.id)}
                  alt=""
                  aria-hidden="true"
                  className="size-full object-contain"
                />
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
