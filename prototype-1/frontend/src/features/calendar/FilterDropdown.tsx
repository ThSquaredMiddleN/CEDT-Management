import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

export interface FilterOption {
  value: string;
  label: string;
}

export function FilterDropdown({
  label,
  icon: Icon,
  options,
  selected,
  onToggle,
  searchable,
}: {
  label: string;
  icon: typeof ChevronDown;
  options: FilterOption[];
  selected: string[];
  onToggle: (value: string) => void;
  searchable?: boolean;
}) {
  const [query, setQuery] = useState("");

  const visible = searchable
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <Icon className="size-3.5 text-neutral-500" />
          {label}
          {selected.length > 0 && (
            <span className="ml-0.5 rounded-full bg-neutral-900 px-1.5 text-[10px] text-neutral-50">
              {selected.length}
            </span>
          )}
          <ChevronDown className="size-3.5 text-neutral-500" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
        {searchable && (
          <div className="p-1">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="h-8 text-xs"
            />
          </div>
        )}
        {visible.length === 0 && (
          <p className="px-2 py-3 text-center text-xs text-neutral-500">No options</p>
        )}
        {visible.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={selected.includes(o.value)}
            onCheckedChange={() => onToggle(o.value)}
            className="text-xs"
          >
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
