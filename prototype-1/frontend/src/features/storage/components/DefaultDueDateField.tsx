import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDefaultDueAt, useSetDefaultDueAt } from "../api/hooks";
import { fromLocalInput, spanLabel, toLocalInput, useNow } from "./dates";

/** Staff: the due date copied onto each request at pickup. */
export function DefaultDueDateField() {
  const due = useDefaultDueAt();
  const save = useSetDefaultDueAt();
  const now = useNow(60_000);
  const [draft, setDraft] = useState<string | null>(null);

  const value = draft ?? (due.data !== undefined ? toLocalInput(due.data) : "");
  const parsed = value ? fromLocalInput(value) : NaN;
  const dirty = draft !== null && Number.isFinite(parsed) && parsed !== due.data && parsed > now;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-5 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label htmlFor="default-due" className="mb-1 block font-body text-body-sm-emphasize text-grey-900">
          กำหนดคืนเริ่มต้น
        </label>
        <Input
          id="default-due"
          type="datetime-local"
          value={value}
          min={toLocalInput(now)}
          onChange={(e) => {
            save.reset();
            setDraft(e.target.value);
          }}
          className="max-w-xs"
        />
        <p className="mt-1 text-xs text-grey-400">
          {Number.isFinite(parsed) && parsed > now && `≈ ${spanLabel(parsed - now)}จากวันนี้ · `}
          ใช้กับการรับของครั้งถัดไป คำขอที่รับของไปแล้วไม่เปลี่ยน
        </p>
        {save.isError && <p role="alert" className="mt-1 text-sm text-status-danger-fg">{(save.error as Error).message}</p>}
      </div>
      <Button
        variant="filled"
        size="lg"
        disabled={!dirty}
        loading={save.isPending}
        onClick={() => save.mutate(parsed, { onSuccess: () => setDraft(null) })}
      >
        บันทึก
      </Button>
    </section>
  );
}
