import { Barcode, Minus, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { IndexTypeBadge } from "./badges";
import { ItemImage } from "./ItemImage";
import type { CartLine } from "./useCart";

interface CartManagerProps {
  lines: CartLine[];
  onAdjust: (itemId: string, delta: number) => void;
  onRemoveSn: (itemId: string, sn: string) => void;
  onRemove?: (itemId: string) => void;
  emptyText?: string;
  showRequested?: boolean;
}

export function CartManager({
  lines,
  onAdjust,
  onRemoveSn,
  onRemove,
  emptyText = "สแกนอุปกรณ์เพื่อเริ่มทำรายการ",
  showRequested = false,
}: CartManagerProps) {
  if (lines.length === 0) {
    return (
      <div className="flex min-h-48 items-center justify-center font-body text-body-sm text-grey-200">
        {emptyText}
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {lines.map((l) => (
        <li key={l.itemId} className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <ItemImage itemId={l.itemId} name={l.name} />
              <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 font-body text-body-sm-emphasize text-grey-900">
                {l.name} <IndexTypeBadge isUnique={l.isUnique} />
              </p>
              <p className="mt-1 font-body text-body-xs text-grey-400">
                {showRequested && l.reqQty !== undefined && <>ขอยืมมา: {l.reqQty} ชิ้น | </>}
                มีในคลัง: <span className="font-semibold text-status-success-fg">{l.maxStock}</span> ชิ้น
                {!showRequested && <> | บาร์โค้ด: {l.itemId}</>}
              </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {l.isUnique ? (
                <Badge variant="outline" className="border-grey-200 bg-grey-100 text-grey-700">
                  จำนวนที่สแกน: {l.qty}
                </Badge>
              ) : (
                <div className="flex items-center rounded-md border border-neutral-300 bg-white">
                  <button
                    type="button"
                    aria-label={`ลดจำนวน ${l.name}`}
                    onClick={() => onAdjust(l.itemId, -1)}
                    className="flex size-8 items-center justify-center border-r border-neutral-200 text-grey-400 hover:bg-neutral-100"
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <span className="w-12 text-center font-body text-body-sm-emphasize" aria-live="polite">
                    {l.qty}
                  </span>
                  <button
                    type="button"
                    aria-label={`เพิ่มจำนวน ${l.name}`}
                    disabled={l.qty >= l.maxStock}
                    onClick={() => onAdjust(l.itemId, 1)}
                    className="flex size-8 items-center justify-center border-l border-neutral-200 text-grey-400 hover:bg-neutral-100 disabled:opacity-40"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
              )}
              {onRemove && !l.isUnique && (
                <button
                  type="button"
                  aria-label={`ลบ ${l.name}`}
                  onClick={() => onRemove(l.itemId)}
                  className="flex size-8 items-center justify-center rounded-full bg-status-danger-bg text-status-danger-fg hover:bg-status-danger-bg hover:text-status-danger-fg"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          </div>

          {l.isUnique && l.sns.length > 0 && (
            <div className="mt-3 space-y-1.5 border-l-2 border-brand-primary pl-3">
              {l.sns.map((sn) => (
                <div
                  key={sn}
                  className={cn(
                    "flex items-center justify-between rounded border border-neutral-200 bg-neutral-50 p-2",
                    "font-mono text-xs font-bold text-grey-700",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Barcode className="size-3.5 text-grey-200" />
                    {sn}
                  </span>
                  <button
                    type="button"
                    aria-label={`ลบ ${sn}`}
                    onClick={() => onRemoveSn(l.itemId, sn)}
                    className="text-status-danger-fg hover:text-status-danger-fg"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
