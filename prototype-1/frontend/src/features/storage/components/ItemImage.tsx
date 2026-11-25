import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ItemImageProps {
  /** Kept for callers; pictures come from the files service later (spec piece 3). */
  itemId?: string;
  src?: string;
  name: string;
  className?: string;
}

/** Equipment thumbnail with a neutral placeholder so lists never show a broken image. */
export function ItemImage({ src, name, className }: ItemImageProps) {
  return (
    <span
      className={cn(
        "flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-neutral-200 bg-grey-100 text-grey-200",
        className,
      )}
    >
      {src ? (
        <img src={src} alt={name} className="size-full object-cover" />
      ) : (
        <ImageIcon className="size-5" aria-label={`ไม่มีรูป ${name}`} role="img" />
      )}
    </span>
  );
}
