import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSetRequestDueAt } from "../api/hooks";
import type { BorrowRequest } from "../types";
import { daysBetween, formatDate, fromLocalInput, toLocalInput } from "./dates";

/** Staff: extend or shorten one closed request's due date; the loan span updates as you type. */
export function DueDateEditor({ req }: { req: BorrowRequest }) {
  const save = useSetRequestDueAt();
  const [draft, setDraft] = useState<string | null>(null);

  const value = draft ?? (req.dueAt ? toLocalInput(req.dueAt) : "");
  const parsed = value ? fromLocalInput(value) : NaN;
  const dirty = draft !== null && Number.isFinite(parsed) && parsed !== req.dueAt;

  return (
    <div className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <label htmlFor="req-due" className="block text-xs font-bold text-grey-700">กำหนดคืน</label>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          id="req-due"
          type="datetime-local"
          value={value}
          min={req.pickedUpAt ? toLocalInput(req.pickedUpAt) : undefined}
          onChange={(e) => setDraft(e.target.value)}
          className="max-w-xs"
        />
        {req.pickedUpAt && Number.isFinite(parsed) && (
          <span className="text-sm text-grey-400">
            ยืม {daysBetween(req.pickedUpAt, parsed)} วัน (รับของ {formatDate(req.pickedUpAt)})
          </span>
        )}
        <Button
          variant="filled"
          size="small"
          className="px-4"
          disabled={!dirty}
          loading={save.isPending}
          onClick={() => save.mutate({ id: req.id, at: parsed }, { onSuccess: () => setDraft(null) })}
        >
          บันทึก
        </Button>
      </div>
      {save.isError && <p role="alert" className="text-sm text-status-danger-fg">{(save.error as Error).message}</p>}
    </div>
  );
}
