import type { CatalogCell, CatalogRow } from "@/api/access";

export interface CellState {
  checked: boolean;
  /** Ticked by a role (or the automatic student role): cannot be toggled here. */
  locked: boolean;
  /** The current user may not give it. */
  disabled: boolean;
  /** Names shown next to the box, e.g. "อาจารย์, Audit". */
  sources: string[];
  change: "added" | "removed" | null;
  /** Hover text, e.g. the reason and granter of a saved direct permission. */
  note?: string;
}

function Box({ cell, state, onToggle }: { cell: CatalogCell; state: CellState; onToggle: (key: string) => void }) {
  const tone = state.change === "added" ? "text-green-700" : state.change === "removed" ? "text-red-700 line-through" : "";
  const hint = state.note ?? (state.disabled && !state.checked ? `${cell.label} (ให้ได้เฉพาะสิทธิ์ที่คุณมี)` : cell.label);
  return (
    <label className={`flex items-start gap-1.5 text-xs ${tone}`} title={hint}>
      <input
        type="checkbox"
        className="mt-0.5"
        checked={state.checked}
        disabled={state.locked || state.disabled}
        onChange={() => onToggle(cell.key)}
        aria-label={cell.label}
      />
      <span>
        {state.locked && "🔒 "}
        {state.sources.filter((s) => s !== "direct").join(", ") || (state.checked ? "รายคน" : "")}
      </span>
    </label>
  );
}

/** Module × use/view/manage table. Used for a user (with locks) and for a role (no locks). */
export function PermissionMatrix({
  rows,
  stateOf,
  onToggle,
}: {
  rows: CatalogRow[];
  stateOf: (key: string) => CellState;
  onToggle: (key: string) => void;
}) {
  const cell = (c: CatalogCell | undefined) => (c ? <Box cell={c} state={stateOf(c.key)} onToggle={onToggle} /> : <span className="text-neutral-400">—</span>);
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left text-neutral-600">
          <th className="py-2 pr-3 font-medium">หมวด</th>
          <th className="py-2 pr-3 font-medium">ใช้งาน</th>
          <th className="py-2 pr-3 font-medium">ดู</th>
          <th className="py-2 font-medium">จัดการ</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.row} className="border-b align-top">
            <td className="py-2 pr-3">{r.label}</td>
            <td className="py-2 pr-3">{cell(r.use)}</td>
            <td className="py-2 pr-3">{cell(r.view)}</td>
            <td className="space-y-1 py-2">
              {r.manage ? (
                <>
                  {r.manage.key && cell({ key: r.manage.key, label: r.manage.label ?? r.manage.key })}
                  {r.manage.parts.map((p) => (
                    <div key={p.key} className="flex items-center gap-1">
                      <span className="text-xs text-neutral-500">{p.label}:</span>
                      {cell(p)}
                    </div>
                  ))}
                </>
              ) : (
                <span className="text-neutral-400">—</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
