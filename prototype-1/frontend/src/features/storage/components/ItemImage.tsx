import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInventory } from "../api/hooks";

interface ItemImageProps {
  /** Look the picture up by equipment id (cached inventory query), or pass `src` directly. */
  itemId?: string;
  src?: string;
  name: string;
  className?: string;
}

/** Equipment thumbnail with a neutral placeholder so lists never show a broken image. */
export function ItemImage({ itemId, src, name, className }: ItemImageProps) {
  const { data } = useInventory();
  const url = src ?? data?.find((i) => i.id === itemId)?.imageUrl;

  return (
    <span
      className={cn(
        "flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-neutral-200 bg-grey-100 text-grey-200",
        className,
      )}
    >
      {url ? (
        <img src={url} alt={name} className="size-full object-cover" />
      ) : (
        <ImageIcon className="size-5" aria-label={`ไม่มีรูป ${name}`} role="img" />
      )}
    </span>
  );
}
