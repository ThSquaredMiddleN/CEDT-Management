import { TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useCreateBorrowRequest, useCurrentStudent } from "../api/hooks";
import type { InventoryItem } from "../types";
import { ResultDialog } from "./layout";

export function QtyStepper({
  value,
  max,
  onChange,
  label,
}: {
  value: number;
  max: number;
  onChange: (qty: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white">
      <button
        type="button"
        aria-label={`ลด ${label}`}
        className="px-3 py-1 text-grey-700 hover:bg-neutral-100"
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <span className="font-body text-body-sm-emphasize text-grey-900" aria-live="polite">{value}</span>
      <button
        type="button"
        aria-label={`เพิ่ม ${label}`}
        disabled={value >= max}
        className="px-3 py-1 text-grey-700 hover:bg-neutral-100 disabled:opacity-40"
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  );
}

/** Cart column: pick a group (type comes from it), review lines, submit. */
export function RequestForm({
  inventory,
  cart,
  onQtyChange,
  onSubmitted,
}: {
  inventory: InventoryItem[];
  cart: Record<string, number>;
  onQtyChange: (itemId: string, qty: number) => void;
  onSubmitted: (requestId: string) => void;
}) {
  const me = useCurrentStudent();
  const create = useCreateBorrowRequest();
  const [groupId, setGroupId] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const groups = me.data?.groups ?? [];
  const group = groups.find((g) => g.id === groupId) ?? groups[0];
  const lines = Object.entries(cart)
    .map(([itemId, qty]) => {
      const item = inventory.find((i) => i.id === itemId);
      return { item, qty: item ? Math.min(qty, item.total) : qty };
    })
    .filter((l): l is { item: InventoryItem; qty: number } => !!l.item);
  const canSubmit = !!group && lines.length > 0 && !create.isPending;

  const submit = () =>
    create.mutate(
      { groupId: group!.id, items: lines.map((l) => ({ itemId: l.item.id, qty: l.qty })) },
      { onSuccess: (req) => setDone(req.id) },
    );

  return (
    <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5 lg:sticky lg:top-6">
      <h2 className="border-b border-neutral-200 pb-2 font-body text-body-md-emphasize text-grey-900">ตะกร้า</h2>

      <div>
        <label htmlFor="req-group" className="mb-1 block text-xs font-bold text-grey-700">กลุ่ม</label>
        <select
          id="req-group"
          value={group?.id ?? ""}
          onChange={(e) => setGroupId(e.target.value)}
          className="h-9 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm shadow-sm"
        >
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.label}</option>
          ))}
        </select>
        {group && <p className="mt-1 text-xs text-grey-400">ประเภท: {group.type}</p>}
      </div>

      {lines.length === 0 ? (
        <p className="py-6 text-center text-sm text-grey-200">ยังไม่ได้เลือกอุปกรณ์</p>
      ) : (
        <ul className="space-y-3">
          {lines.map(({ item, qty }) => (
            <li key={item.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-grey-900">{item.name}</span>
                <button
                  type="button"
                  aria-label={`เอา ${item.name} ออก`}
                  onClick={() => onQtyChange(item.id, 0)}
                  className="text-grey-200 hover:text-status-danger-fg"
                >
                  <X className="size-4" />
                </button>
              </div>
              <QtyStepper value={qty} max={item.total} onChange={(q) => onQtyChange(item.id, q)} label={item.name} />
              {qty > item.available && (
                <p className="flex items-center gap-1 text-xs text-status-warning-fg">
                  <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                  เกินจำนวนที่ว่าง ({item.available}) · ส่วนที่เกินจะรอคิว
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {create.isError && (
        <p role="alert" className="text-sm text-status-danger-fg">{(create.error as Error).message}</p>
      )}
      <Button variant="filled" size="lg" className="w-full" disabled={!canSubmit} loading={create.isPending} onClick={submit}>
        ส่งคำขอ
      </Button>

      <ResultDialog
        open={done !== null}
        title="ส่งคำขอแล้ว"
        message={`คำขอ ${done} เข้าคิวแล้ว\nเจ้าหน้าที่จะแจ้งเวลานัดรับในแท็บ "คำขอของฉัน"`}
        onClose={() => {
          const id = done!;
          setDone(null);
          onSubmitted(id);
        }}
      />
    </div>
  );
}
