import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Brand } from "@/components/Brand";
import { TopbarMenuItem } from "@/components/TopbarMenuItem";
import { cn } from "@/lib/utils";

export interface TopbarItem {
  label: string;
  to?: string;
  active?: boolean;
  onClick?: () => void;
}

export interface TopbarProps {
  items: TopbarItem[];
  logoTo?: string;
  rightSlot?: ReactNode;
  className?: string;
}

export function Topbar({
  items,
  logoTo = "/",
  rightSlot,
  className,
}: TopbarProps) {
  return (
    <header
      className={cn(
        "relative z-10 flex h-14 w-full shrink-0 items-center justify-between bg-white-50 px-4 shadow-topbar md:px-8",
        className,
      )}
    >
      <div className="flex h-full min-w-0 items-center gap-8 lg:gap-16">
        {logoTo ? (
          <Link
            to={logoTo}
            aria-label="CEDT LabSync Home"
            className="shrink-0 whitespace-nowrap rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
          >
            <Brand tone="primary" />
          </Link>
        ) : (
          <div className="shrink-0 whitespace-nowrap">
            <Brand tone="primary" />
          </div>
        )}

        {items.length > 0 && (
          <nav
            aria-label="Main navigation"
            className="flex h-full items-center gap-6 lg:gap-8"
          >
            {items.map((item) => (
              <TopbarMenuItem
                key={item.label}
                label={item.label}
                to={item.to}
                active={item.active}
                onClick={item.onClick}
                className="h-full"
              />
            ))}
          </nav>
        )}
      </div>

      {rightSlot && (
        <div className="flex shrink-0 items-center gap-4 py-3">
          {rightSlot}
        </div>
      )}
    </header>
  );
}
