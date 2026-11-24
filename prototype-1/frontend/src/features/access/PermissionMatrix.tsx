import { useId, type ReactNode } from "react";
import { Check, CornerDownRight, Lock, Minus, Plus } from "lucide-react";
import type { CatalogCell, CatalogRow } from "@/api/access";
import { Card } from "@/components/ui/card";
import { cellLook, cellTip, displayRows, roleSources, type CellLook, type CellState } from "./matrix";

/** CSS-only popover above its child (below it near the top of the scroll area); shown on hover and keyboard focus. */
function Tip({ id, text, below = false, children }: { id: string; text: string; below?: boolean; children: ReactNode }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-20 w-max ${below ? "top-full mt-1.5" : "bottom-full mb-1.5"} max-w-[260px] -translate-x-1/2 whitespace-normal rounded-md bg-neutral-900 px-2 py-1 text-center text-xs font-normal leading-snug text-white opacity-0 shadow transition-opacity group-focus-within/tip:opacity-100 group-hover/tip:opacity-100`}
      >
        {text}
      </span>
    </span>
  );
}

const BOX: Record<Exclude<CellLook, "locked">, string> = {
  empty: "border-neutral-300 bg-white",
  saved: "border-[#378ADD] bg-[#378ADD] text-white",
  add: "border-[#639922] bg-[#EAF3DE] text-[#3B6D11]",
  remove: "border-[#E24B4A] bg-[#FCEBEB] text-[#A32D2D]",
};

function Glyph({ look, size }: { look: CellLook; size: number }) {
  const p = { size, strokeWidth: 3, "aria-hidden": true } as const;
  if (look === "saved") return <Check {...p} />;
  if (look === "add") return <Plus {...p} />;
  if (look === "remove") return <Minus {...p} />;
  return null;
}

function Cell({ cell, state, onToggle, below }: { cell: CatalogCell; state: CellState; onToggle: (key: string) => void; below: boolean }) {
  const tipId = useId();
  const look = cellLook(state);
  const tip = cellTip(state, cell.label);
  if (look === "locked") {
    return (
      <Tip id={tipId} text={tip} below={below}>
        <span
          tabIndex={0}
          role="img"
          aria-label={`${cell.label}: ${tip}`}
          className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-md bg-[#E6F1FB] text-[#185FA5] outline-none focus-visible:ring-2 focus-visible:ring-[#378ADD]"
        >
          <Lock size={15} aria-hidden />
        </span>
      </Tip>
    );
  }
  return (
    <Tip id={tipId} text={tip} below={below}>
      <button
        type="button"
        role="checkbox"
        aria-checked={state.checked}
        aria-label={cell.label}
        aria-describedby={tipId}
        disabled={state.disabled}
        onClick={() => onToggle(cell.key)}
        className={`inline-flex h-[22px] w-[22px] items-center justify-center rounded-md border-[1.5px] outline-none focus-visible:ring-2 focus-visible:ring-[#378ADD] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${BOX[look]}`}
      >
        <Glyph look={look} size={14} />
      </button>
    </Tip>
  );
}

function Legend({ withLock, savedLabel }: { withLock: boolean; savedLabel: string }) {
  const mini = (look: Exclude<CellLook, "locked">) => (
    <span className={`inline-flex h-4 w-4 items-center justify-center rounded border ${BOX[look]}`}>
      <Glyph look={look} size={10} />
    </span>
  );
  const item = (icon: ReactNode, label: string) => (
    <span className="inline-flex items-center gap-1.5">
      {icon}
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-neutral-100 px-4 py-3 text-xs text-neutral-500">
      {withLock &&
        item(
          <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-[#E6F1FB] text-[#185FA5]">
            <Lock size={10} aria-hidden />
          </span>,
          "ได้จากบทบาท",
        )}
      {item(mini("empty"), "ไม่มี")}
      {item(mini("saved"), savedLabel)}
      {item(mini("add"), "จะเพิ่ม")}
      {item(mini("remove"), "จะถอน")}
    </div>
  );
}

const DASH = <span className="text-neutral-300" aria-label="ไม่มี">—</span>;

/** Module × use/view/manage table. Used for a user (with locks) and for a role (no locks). */
export function PermissionMatrix({
  rows,
  stateOf,
  onToggle,
  forRole = false,
  maxHeightClass = "max-h-[calc(100vh-400px)]",
}: {
  rows: CatalogRow[];
  stateOf: (key: string) => CellState;
  onToggle: (key: string) => void;
  /** Cells are role permissions rather than per-user grants (affects the legend only). */
  forRole?: boolean;
  /** Tailwind max-height class of the scroll area; reserve room for whatever sits above the table. */
  maxHeightClass?: string;
}) {
  const hasLocks = rows.some((r) =>
    [r.use, r.view, r.manage?.key ? { key: r.manage.key } : undefined, ...(r.manage?.parts ?? [])].some((c) => c && roleSources(stateOf(c.key)).length > 0),
  );
  const th = "bg-blue-50 px-2 py-2 text-xs font-medium text-blue-900";
  const td = "px-2 py-2.5 text-center";
  const list = displayRows(rows);
  return (
    <Card className="overflow-hidden p-0">
      <div className={`overflow-y-auto ${maxHeightClass}`}>
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-30">
            <tr>
              <th className={`${th} pl-4 text-left`}>หมวด</th>
              <th className={`${th} text-center`}>ใช้งาน</th>
              <th className={`${th} text-center`}>ดู</th>
              <th className={`${th} text-center`}>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {list.map((d, i) => {
              // Tooltips open downward in the first rows so the sticky header / scroll edge never clips them.
              const below = i < 2;
              const cell = (c: CatalogCell | undefined) => (c ? <Cell cell={c} state={stateOf(c.key)} onToggle={onToggle} below={below} /> : DASH);
              if (d.kind === "part") {
                return (
                  <tr key={d.id} className="border-t border-dashed border-neutral-200 bg-neutral-50 align-middle">
                    <td className="py-2 pl-9 pr-2 text-[13px] text-neutral-500">
                      <span className="inline-flex items-center gap-1.5">
                        <CornerDownRight size={13} aria-hidden className="shrink-0" />
                        {d.part.label}
                      </span>
                    </td>
                    <td className={td}>{DASH}</td>
                    <td className={td}>{DASH}</td>
                    <td className={td}>{cell(d.part)}</td>
                  </tr>
                );
              }
              const r = d.row;
              const manage = r.manage?.key ? { key: r.manage.key, label: r.manage.label ?? r.manage.key } : undefined;
              return (
                <tr key={d.id} className="border-t border-neutral-100 align-middle first:border-t-0">
                  <td className="py-2.5 pl-4 pr-2">{r.label}</td>
                  <td className={td}>{cell(r.use)}</td>
                  <td className={td}>{cell(r.view)}</td>
                  <td className={td}>{cell(manage)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Legend withLock={!forRole && hasLocks} savedLabel={forRole ? "ในบทบาท" : "ให้รายคนแล้ว"} />
    </Card>
  );
}
