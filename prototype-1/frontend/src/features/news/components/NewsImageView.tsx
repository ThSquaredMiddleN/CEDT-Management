import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { getDemoNewsImage, isDemoMode } from "@/demo/demoMode";
import { newsImageUrl } from "../news-utils";

export function NewsImageView({
  newsId,
  imageId,
  alt,
  className,
}: {
  newsId: string;
  imageId: string;
  alt: string;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(() =>
    isDemoMode ? null : newsImageUrl(newsId, imageId),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isDemoMode) {
      setSrc(newsImageUrl(newsId, imageId));
      return;
    }

    let active = true;
    let objectUrl: string | null = null;
    setSrc(null);
    setError(null);
    void getDemoNewsImage(newsId, imageId)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch((imageError: unknown) => {
        if (!active) return;
        setError(
          imageError instanceof Error ? imageError.message : "ไม่สามารถอ่านรูป Demo ได้",
        );
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [newsId, imageId]);

  if (error) {
    return (
      <span className={cn("flex items-center justify-center p-2 text-center text-body-xs text-grey-700", className)} role="alert">
        โหลดรูป Demo ไม่สำเร็จ: {error}
      </span>
    );
  }
  if (!src) {
    return (
      <span
        className={cn("flex items-center justify-center text-body-xs text-grey-400", className)}
        role="status"
        aria-label="กำลังโหลดรูป"
      />
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      aria-hidden={alt.length === 0 || undefined}
      className={className}
    />
  );
}
