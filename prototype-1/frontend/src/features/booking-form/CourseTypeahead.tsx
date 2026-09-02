import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCourses } from "@/api/endpoints";
import type { Course } from "@/api/types";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Course-code typeahead (§7b): 250 ms debounce, dropdown of matches, selection auto-fills the
 * course name and default instructor. Editing the text after picking clears the selection, so
 * the form can never submit a code the user has since changed.
 */
export function CourseTypeahead({
  value,
  onSelect,
  onClear,
}: {
  value: Course | null;
  onSelect: (course: Course) => void;
  onClear: () => void;
}) {
  const [text, setText] = useState(value?.code ?? "");
  const [debounced, setDebounced] = useState(text);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  // Keep the input in sync when the form is reset (pre-fill / clone / submit-another).
  useEffect(() => {
    setText(value?.code ?? "");
  }, [value]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text), 250);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    const onClickAway = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  const query = debounced.trim();
  const { data } = useCourses({ q: query, active: "true" }, query.length >= 2);
  const matches = data?.items ?? [];

  const choose = (c: Course) => {
    onSelect(c);
    setText(c.code);
    setOpen(false);
  };

  return (
    <div className="relative" ref={boxRef}>
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-500" />
      <Input
        value={text}
        placeholder="Type to search, e.g. CEDT101"
        className="pl-9"
        autoComplete="off"
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setHighlight(0);
          if (value) onClear();
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open || matches.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const picked = matches[highlight];
            if (picked) choose(picked);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />

      {open && query.length >= 2 && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-neutral-200 bg-white p-1 shadow-md">
          {matches.length === 0 ? (
            <div className="px-3 py-2 text-xs text-neutral-500">
              Course not found — contact CEDT staff to add it
            </div>
          ) : (
            matches.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onMouseEnter={() => setHighlight(i)}
                onClick={() => choose(c)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm",
                  i === highlight && "bg-neutral-100",
                )}
              >
                <span className="font-semibold">{c.code}</span>
                <span className="truncate pl-3 text-xs text-neutral-500">{c.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
