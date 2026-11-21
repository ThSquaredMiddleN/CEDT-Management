import { Button } from "@/components/ui/button";
import { useReopenBorrow } from "../api/hooks";
import type { BorrowRequest } from "../types";
import { formatCountdown, useNow } from "./dates";

/** One row per request whose stock came back, with a live countdown to the hold expiry. */
export function RestockBanner({ requests }: { requests: BorrowRequest[] }) {
  const now = useNow();
  const reopen = useReopenBorrow();
  const flagged = requests.filter((r) => r.status === "UNFULFILLED" && r.restock && r.restock.expiresAt > now);
  if (flagged.length === 0) return null;

  return (
    <div className="space-y-2">
      {flagged.map((r) => (
        <div
          key={r.id}
          role="status"
          className="flex flex-col gap-2 rounded-lg border border-status-warning-border bg-status-warning-bg p-3 font-body text-body-sm text-status-warning-fg sm:flex-row sm:items-center sm:justify-between"
        >
          <p>
            <span className="font-bold">{r.items.map((i) => i.name).join(", ")} มีของแล้ว</span> · {r.id} · เปิดคำขอใหม่ภายใน{" "}
            <span className="font-mono font-bold">{formatCountdown(r.restock!.expiresAt - now)}</span>
          </p>
          <Button
            variant="filled"
            size="small"
            className="shrink-0 px-4"
            loading={reopen.isPending && reopen.variables === r.id}
            onClick={() => reopen.mutate(r.id)}
          >
            เปิดคำขอ
          </Button>
        </div>
      ))}
      {reopen.isError && (
        <p role="alert" className="text-sm text-status-danger-fg">{(reopen.error as Error).message}</p>
      )}
    </div>
  );
}
