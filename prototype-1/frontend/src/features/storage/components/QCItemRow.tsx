import { cn } from "@/lib/utils";
import { ItemStatusBadge } from "./badges";
import { ItemImage } from "./ItemImage";
import { itemLabel } from "./itemLabel";
import type { QCDecision, QCItem, QCResults } from "../types";

const OPTIONS: { value: QCDecision; label: string; active: string }[] = [
  { value: "AVAILABLE", label: "พร้อมใช้", active: "border-status-success-solid bg-status-success-solid text-white" },
  { value: "DAMAGED", label: "ชำรุด", active: "border-status-warning-solid bg-status-warning-solid text-white" },
  { value: "LOST", label: "สูญหาย", active: "border-status-danger-solid bg-status-danger-solid text-white" },
];

export const emptyResults = (): QCResults => ({ AVAILABLE: 0, DAMAGED: 0, LOST: 0 });
export const resultsTotal = (r: QCResults) => r.AVAILABLE + r.DAMAGED + r.LOST;

interface QCItemRowProps {
  item: QCItem;
  /** Current inspection counts for this item (editing). Read-only rows use item.results. */
  results?: QCResults;
  readOnly?: boolean;
  onChange?: (results: QCResults) => void;
}

function Summary({ results }: { results: QCResults }) {
  return (
    <span className="font-body text-body-xs text-grey-400">
      พร้อมใช้ {results.AVAILABLE} · ชำรุด {results.DAMAGED} · สูญหาย {results.LOST}
    </span>
  );
}

export function QCItemRow({ item, results = emptyResults(), readOnly, onChange }: QCItemRowProps) {
  if (readOnly) {
    const done = item.results;
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4 opacity-80">
        <div className="flex min-w-0 items-center gap-3">
          <ItemImage itemId={item.itemId} name={item.name} />
          <div>
            <p className="font-body text-body-sm-emphasize text-grey-700">{itemLabel(item)}</p>
            {!item.isUnique && done && <Summary results={done} />}
          </div>
        </div>
        <ItemStatusBadge status={item.status} />
      </div>
    );
  }

  const total = resultsTotal(results);
  const remaining = item.qty - total;
  const decided = remaining === 0;

  return (
    <div className={cn("rounded-xl border border-neutral-200 p-4", decided ? "bg-white shadow-sm" : "bg-neutral-50")}>
      <div className="mb-3 flex items-center gap-3">
        <ItemImage itemId={item.itemId} name={item.name} />
        <p className="font-body text-body-sm-emphasize text-grey-900">{itemLabel(item)}</p>
      </div>

      {item.isUnique ? (
        <div role="radiogroup" aria-label={`สถานะ ${itemLabel(item)}`} className="flex flex-col gap-2 sm:flex-row">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={results[o.value] > 0}
              onClick={() => onChange?.({ ...emptyResults(), [o.value]: 1 })}
              className={cn(
                "flex-1 rounded-lg border py-2 font-body text-body-sm-emphasize transition-colors",
                results[o.value] > 0 ? o.active : "border-neutral-300 bg-white text-grey-400 hover:bg-neutral-100",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-3 gap-2">
            {OPTIONS.map((o) => (
              <label key={o.value} className="block">
                <span className="mb-1 block font-body text-body-xs text-grey-400">{o.label}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={item.qty}
                  value={results[o.value]}
                  onChange={(e) => {
                    const n = Math.max(0, Math.min(item.qty, Math.floor(Number(e.target.value) || 0)));
                    onChange?.({ ...results, [o.value]: n });
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
