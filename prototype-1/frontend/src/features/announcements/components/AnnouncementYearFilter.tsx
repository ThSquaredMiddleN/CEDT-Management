import { cn } from "@/lib/utils";
import type { AnnouncementYearAudience } from "../announcement-utils";

export type AnnouncementYearFilterValue = AnnouncementYearAudience | "any";

const YEAR_FILTER_OPTIONS: { value: AnnouncementYearFilterValue; label: string }[] = [
  { value: "any", label: "All" },
  { value: "year1", label: "ปี 1" },
  { value: "year2", label: "ปี 2" },
  { value: "year3", label: "ปี 3" },
  { value: "year4", label: "ปี 4" },
];

interface AnnouncementYearFilterProps {
  value: AnnouncementYearFilterValue;
  onChange: (value: AnnouncementYearFilterValue) => void;
  className?: string;
}

export function AnnouncementYearFilter({
  value,
  onChange,
  className,
}: AnnouncementYearFilterProps) {
  return (
    <div
      role="group"
      aria-label="กรองตามชั้นปี"
      className={cn(
        "inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-grey-100 p-[3px]",
        className,
      )}
    >
      {YEAR_FILTER_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={
            value === option.value
              ? "h-[26px] shrink-0 rounded-md bg-white px-2.5 font-body text-body-xs text-grey-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
              : "h-[26px] shrink-0 rounded-md px-2.5 font-body text-body-xs text-grey-400 hover:text-grey-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
