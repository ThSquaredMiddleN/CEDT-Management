import type { ReactNode } from "react";
import { Bars3CenterLeftIcon } from "@heroicons/react/24/outline";
import { Brand } from "@/components/Brand";
import { cn } from "@/lib/utils";

export interface SidebarItem {
  label: string;
  icon: ReactNode;
  active?: boolean;
}

interface SidebarProps {
  items: SidebarItem[];
  collapsed: boolean;
  onToggle: () => void;
  footer?: ReactNode;
}

export function Sidebar({ items, collapsed, onToggle, footer }: SidebarProps) {
  return (
    <aside
      className={cn(
        "flex h-dvh shrink-0 flex-col overflow-hidden border-r border-[#e8e8e8] bg-white-50 transition-[width] duration-200",
        collapsed ? "w-[57px]" : "w-[220px]",
      )}
      aria-label="Main sidebar"
    >
      <div
        className={cn(
          "flex h-[63px] shrink-0 items-center border-b border-[#e8e8e8]",
          collapsed ? "justify-center px-3" : "justify-between px-4",
        )}
      >
        {!collapsed && <Brand tone="primary" />}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-grey-900 transition-colors hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        >
          <Bars3CenterLeftIcon className="size-5" aria-hidden="true" />
        </button>
      </div>

      <nav className={cn("min-h-0 flex-1 overflow-y-auto", collapsed ? "px-[10px] py-2" : "px-3 py-2")}>
        {!collapsed && items.length > 0 && (
          <p className="px-2 py-1 font-body text-body-xs text-grey-200">
            เมนู
          </p>
        )}
        <div className={cn("flex flex-col", collapsed ? "items-center" : "items-stretch")}>
          {items.map(({ label, icon, active }) => (
            <button
              key={label}
              type="button"
              title={collapsed ? label : undefined}
              aria-label={collapsed ? label : undefined}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center rounded-lg font-body text-body-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary",
                collapsed
                  ? "my-0.5 h-10 w-full justify-center px-2 py-3"
                  : "min-h-10 w-full gap-2.5 p-3",
                active
                  ? "bg-brand-primary text-white"
                  : "text-grey-400 hover:bg-transparent hover:text-grey-700",
              )}
            >
              <span className="flex size-4 shrink-0 items-center justify-center [&>svg]:size-4">
                {icon}
              </span>
              {!collapsed && <span className="min-w-0 truncate">{label}</span>}
            </button>
          ))}
        </div>
      </nav>

      {footer && (
        <div
          className={cn(
            "flex shrink-0 items-center border-t border-[#e8e8e8]",
            collapsed ? "justify-center px-3 py-4" : "gap-2 p-4",
          )}
        >
          {footer}
        </div>
      )}
    </aside>
  );
}
