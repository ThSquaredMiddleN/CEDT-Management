import { CircleAlert, PackageOpen, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { IndexTypeBadge } from "./badges";
import { ItemImage } from "./ItemImage";
import { itemLabel } from "./itemLabel";
import type { PendingReturnItem, ReturnCounts, ReturnDecision } from "../types";

export const emptyCounts = (): ReturnCounts => ({ RETURNED: 0, NOT_BROUGHT: 0, LOST: 0 });
export const countsTotal = (c: ReturnCounts) => c.RETURNED + c.NOT_BROUGHT + c.LOST;

interface ReturnItemRowProps {
  item: PendingReturnItem;
  counts?: ReturnCounts;
  onChange: (counts: ReturnCounts) => void;
}

const ACTIVE: Record<ReturnDecision, string> = {
  RETURNED: "border-status-info-solid bg-brand-primary text-white",
  NOT_BROUGHT: "border-grey-400 bg-grey-400 text-white",
  LOST: "border-status-danger-solid bg-status-danger-solid text-white",
};

/**
 * One owed line. Unique units get a single choice; bulk batches are split by counts that
 * must add up to the batch size (e.g. 3 returned now, 2 not brought).
 */
export function ReturnItemRow({ item, counts = emptyCounts(), onChange }: ReturnItemRowProps) {
  const overdue = item.owedStatus === "NOT_BROUGHT";
  const options: { value: ReturnDecision; label: string }[] = [
    { value: "RETURNED", label: item.isUnique ? "รับของคืนแล้ว (รอ QC)" : "รับคืนแล้ว (รอ QC)" },
    { value: "NOT_BROUGHT", label: overdue ? "ยังไม่ได้นำมา" : "ไม่ได้นำมา" },
    ...(overdue ? [{ value: "LOST" as const, label: "สูญหาย (ปรับเงิน)" }] : []),
  ];
  const remaining = item.qty - countsTotal(counts);
  const decided = remaining === 0;

  return (
    <div className={cn("rounded-lg border border-neutral-200 p-4", decided ? "bg-neutral-100" : "bg-white")}>
      <div className="mb-4 flex items-center gap-3">
        <ItemImage itemId={item.itemId} name={item.name} />
        <div>
          <p className="flex flex-wrap items-center gap-2 font-body text-body-sm-emphasize text-grey-900">
            {itemLabel(item)} <IndexTypeBadge isUnique={item.isUnique} />
          </p>
          {overdue && item.notBroughtAt && (
            <p className="mt-1 flex items-center gap-1 font-body text-body-xs text-status-warning-fg">
              <CircleAlert className="size-3.5" aria-hidden="true" />
              ค้างส่ง · ไม่ได้นำมาเมื่อ {new Date(item.notBroughtAt).toLocaleDateString("th-TH", { dateStyle: "medium" })}
            </p>
          )}
        </div>
      </div>

      {item.isUnique ? (
        <div role="radiogroup" aria-label={`สถานะ ${itemLabel(item)}`} className="flex flex-col gap-2 sm:flex-row">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={counts[o.value] > 0}
              onClick={() => onChange({ ...emptyCounts(), [o.value]: 1 })}
              className={cn(
                "flex flex-1 items-center justify-center gap-1 rounded-lg border py-2 text-sm font-bold transition-colors",
                counts[o.value] > 0 ? ACTIVE[o.value] : "border-neutral-300 bg-white text-grey-400 hover:bg-neutral-100",
              )}
            >
              {o.value === "RETURNED" && <PackageOpen className="size-4" />}
              {o.value === "NOT_BROUGHT" && <X className="size-4" />}
              {o.label}
            </button>
          ))}
        </div>
      ) : (
        <div>
          <div className={cn("grid gap-2", overdue ? "grid-cols-3" : "grid-cols-2")}>
            {options.map((o) => (
              <label key={o.value} className="block">
                <span className="mb-1 block font-body text-body-xs text-grey-400">{o.label}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={item.qty}
                  value={counts[o.value]}
                  onChange={(e) => {
                    const n = Math.max(0, Math.min(item.qty, Math.floor(Number(e.target.value) || 0)));
                    onChange({ ...counts, [o.value]: n });
                  }}
                  aria-label={`${o.label} ${itemLabel(item)}`}
                  className="h-9 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-primary"
                />
              </label>
            ))}
          </div>
          <p
            className={cn(
              "mt-2 font-body text-body-xs",
              remaining === 0 ? "text-status-success-fg" : remaining < 0 ? "text-status-danger-fg" : "text-grey-400",
            )}
            aria-live="polite"
          >
            {remaining === 0
              ? `ครบ ${item.qty} ชิ้นแล้ว`
              : remaining > 0
                ? `เหลืออีก ${remaining} จาก ${item.qty} ชิ้นที่ต้องระบุ`
                : `เกินมา ${-remaining} ชิ้น (รวมต้องเท่ากับ ${item.qty})`}
          </p>
        </div>
      )}
    </div>
  );
}
