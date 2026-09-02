import { useEffect, useState } from "react";
import { Spinner } from "@/components/states";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const MIN_REASON = 10;

export function RejectDialog({
  open,
  onOpenChange,
  summary,
  defaultReason = "",
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: string;
  defaultReason?: string;
  isPending: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState(defaultReason);

  // Re-seed the reason each time the dialog opens (the 409 path pre-suggests one).
  useEffect(() => {
    if (open) setReason(defaultReason);
  }, [open, defaultReason]);

  const valid = reason.trim().length >= MIN_REASON;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject request</DialogTitle>
          <DialogDescription>{summary}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why this request is being rejected. The instructor sees this verbatim."
            className="min-h-24"
          />
          <p className="text-xs text-neutral-500">
            {valid ? `${reason.trim().length} characters` : `${MIN_REASON} characters minimum`}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!valid || isPending} onClick={() => onConfirm(reason.trim())}>
            {isPending && <Spinner />}
            Reject request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
