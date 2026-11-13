import { cn } from "@/lib/utils";
import { ItemStatusBadge } from "./badges";
import type { QCItem, QCItemStatus } from "../types";

type Decision = Exclude<QCItemStatus, "PENDING_TEST">;

const OPTIONS: { value: Decision; label: string; active: string }[] = [
  { value: "AVAILABLE", label: "พร้อมใช้", active: "border-green-500 bg-green-500 text-white" },
  { value: "DAMAGED", label: "ชำรุด", active: "border-orange-500 bg-orange-500 text-white" },
  { value: "LOST", label: "สูญหาย", active: "border-red-500 bg-red-500 text-white" },
];

interface QCItemRowProps {
  item: QCItem;
  readOnly?: boolean;
  onChange?: (status: Decision) => void;
}

export function QCItemRow({ item, readOnly, onChange }: QCItemRowProps) {
  if (readOnly) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 p-4 opacity-80">
        <p className="font-body text-body-sm-emphasize text-grey-700">{item.name}</p>
        <ItemStatusBadge status={item.status} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-neutral-200 p-4",
        item.status === "PENDING_TEST" ? "bg-neutral-50" : "bg-white shadow-sm",
      )}
    >
      <p className="mb-3 font-body text-body-sm-emphasize text-grey-900">{item.name}</p>
      <div role="radiogroup" aria-label={`สถานะ ${item.name}`} className="flex flex-col gap-2 sm:flex-row">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={item.status === o.value}
            onClick={() => onChange?.(o.value)}
            className={cn(
              "flex-1 rounded-lg border py-2 font-body text-body-sm-emphasize transition-colors",
              item.status === o.value
                ? o.active
                : "border-neutral-300 bg-white text-grey-400 hover:bg-neutral-100",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
