import { useEffect, useState } from "react";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/** Confirms a batch of changes with one required reason. Keeps the draft when the API refuses. */
export function SaveChangesDialog({
  open,
  title,
  changes,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  changes: string[];
  onClose: () => void;
  onConfirm: (reason: string) => Promise<unknown>;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setReason("");
      setError(null);
    }
  }, [open]);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      setReason("");
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {changes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <label className="text-sm font-medium" htmlFor="access-reason">
          เหตุผล (บังคับ)
        </label>
        <Textarea id="access-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>ยกเลิก</Button>
          <Button onClick={() => void confirm()} disabled={busy || !reason.trim()}>{busy ? "กำลังบันทึก…" : "ยืนยัน"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
