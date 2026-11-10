import type { ReactNode } from "react";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import { HomeIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";

interface MenuItemProps {
  className?: string;
  icon?: ReactNode;
  text?: string;
}

export function MenuItem({
  className,
  icon = <HomeIcon aria-hidden="true" />,
  text = "Text",
}: MenuItemProps) {
  return (
    <button
      type="button"
      aria-label={text}
      className={cn(
        "flex w-full items-center justify-between rounded-xl border border-grey-200 bg-surface px-5 py-4 text-left transition-colors hover:border-brand-primary hover:bg-brand-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary",
        className,
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex size-6 shrink-0 items-center justify-center text-brand-primary [&>svg]:size-6">
          {icon}
        </span>
        <span className="min-w-0 truncate font-body text-body-md text-grey-900">
          {text}
        </span>
      </span>
      <ArrowRightIcon
        className="ml-3 size-5 shrink-0 text-brand-primary"
        aria-hidden="true"
      />
    </button>
  );
}
