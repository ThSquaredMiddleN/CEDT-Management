import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export interface TopbarMenuItemProps {
  label: string;
  active?: boolean;
  to?: string;
  onClick?: () => void;
  className?: string;
}

export function TopbarMenuItem({
  label,
  active = false,
  to,
  onClick,
  className,
}: TopbarMenuItemProps) {
  const itemClassName = cn(
    "relative inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-sm py-1.5 font-body text-body-sm transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2",
    "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:transition-colors after:content-['']",
    active
      ? "text-brand-primary after:bg-brand-primary"
      : "text-grey-400 hover:text-grey-700 after:bg-transparent",
    className,
  );

  if (to) {
    return (
      <Link
        to={to}
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        className={itemClassName}
      >
        {label}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={itemClassName}
    >
      {label}
    </button>
  );
}
