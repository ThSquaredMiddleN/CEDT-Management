import { cn } from "@/lib/utils";

export interface TabItem<T extends string> {
  value: T;
  label: string;
  /** Shown as a small badge when greater than zero. */
  count?: number;
}

/** Underline section navigation (URL-driven): active item in brand blue. */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <nav aria-label={label} className="flex gap-6 border-b border-neutral-200">
      {items.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onChange(t.value)}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-1 pb-2 pt-1 font-body text-body-sm-emphasize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary",
              active ? "border-brand-primary text-brand-primary" : "border-transparent text-grey-400 hover:text-grey-900",
            )}
          >
            {t.label}
            {!!t.count && (
              <span
                aria-label={`${t.count} รายการ`}
                className={cn(
                  "rounded-full px-1.5 text-[11px] font-bold",
                  active ? "bg-brand-primary text-white" : "bg-grey-100 text-grey-400",
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
