import { useState } from "react";
import { EmptyState, SkeletonRow } from "@/components/states";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCancelBorrow, useConfirmPickup, useReopenBorrow } from "../api/hooks";
import { DueBadge, RequestStatusPill } from "../components/badges";
import { formatCountdown, formatDate, formatDateTime, useNow } from "../components/dates";
import { ItemImage } from "../components/ItemImage";
import { ConfirmDialog } from "../components/layout";
import { PickupCard } from "../components/PickupCard";
import type { BorrowRequest } from "../types";

function RestockAction({ req }: { req: BorrowRequest }) {
  const now = useNow();
  const reopen = useReopenBorrow();
  const expired = req.restock!.expiresAt <= now;
  return (
    <div className="w-full space-y-2 rounded-lg border border-status-warning-border bg-status-warning-bg p-3 font-body text-body-sm text-status-warning-fg">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span>
          มีของแล้ว · เปิดคำขอภายใน{" "}
          {expired ? (
            <span className="font-bold">หมดเวลาแล้ว</span>
          ) : (
            <span className="font-mono font-bold">{formatCountdown(req.restock!.expiresAt - now)}</span>
          )}
        </span>
        <Button
          variant="filled"
          size="small"
          className="px-4"
          disabled={expired}
          loading={reopen.isPending}
          onClick={() => reopen.mutate(req.id)}
        >
          เปิดคำขอ
        </Button>
      </div>
      {reopen.isError && <p role="alert" className="text-status-danger-fg">{(reopen.error as Error).message}</p>}
    </div>
  );
}

function RequestDetail({ req }: { req: BorrowRequest }) {
  const now = useNow(60_000);
  const pickup = useConfirmPickup();
  const cancel = useCancelBorrow();
  const [confirming, setConfirming] = useState<null | "pickup" | "cancel">(null);

  const issued = req.status === "READY_FOR_PICKUP" || req.status === "CLOSED";
  const canCancel = req.status === "OPEN" || req.status === "UNFULFILLED";
  const error = (pickup.error ?? cancel.error) as Error | null;

  return (
    <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-body text-body-md-emphasize text-grey-900">{req.id}</h2>
          <p className="mt-1 text-xs text-grey-400">
            {req.group} · {req.type} · ส่งโดย {req.user} · {formatDateTime(req.createdAt)}
          </p>
        </div>
        <RequestStatusPill req={req} />
      </div>

      {req.status === "REJECTED" && (
        <div role="note" className="rounded-lg border border-status-danger-border bg-status-danger-bg p-4 font-body text-body-sm text-status-danger-fg">
          <p className="font-bold">คำขอนี้ถูกปฏิเสธ</p>
          {req.rejectReason && <p className="mt-1">เหตุผล: {req.rejectReason}</p>}
          <p className="mt-1 text-xs">ถ้ายังต้องการยืม ส่งคำขอใหม่ได้ที่แท็บ "ยืมอุปกรณ์"</p>
        </div>
      )}

      {(req.status === "READY_FOR_PICKUP" || req.status === "CLOSED") && req.pickup && <PickupCard pickup={req.pickup} />}

      {req.status === "CLOSED" && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-grey-700">
          รับของเมื่อ {req.pickedUpAt ? formatDate(req.pickedUpAt) : "-"}
          {req.dueAt && (
            <>
              {" "}· กำหนดคืน <DueBadge dueAt={req.dueAt} now={now} />
            </>
          )}
        </p>
      )}

      <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
        {req.items.map((it) => (
          <li key={it.itemId} className="flex items-center gap-3 p-3">
            <ItemImage itemId={it.itemId} name={it.name} className="size-10" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-grey-900">{it.name}</span>
              {issued && !!it.issuedSerials?.length && (
                <span className="block font-mono text-xs text-grey-400">{it.issuedSerials.join(", ")}</span>
              )}
            </span>
            <span className="whitespace-nowrap text-sm text-grey-700">
              {issued ? `ได้ ${it.issuedQty}/${it.reqQty}` : `ขอ ${it.reqQty}`}
            </span>
          </li>
        ))}
      </ul>

      {req.status === "UNFULFILLED" && req.restock && <RestockAction req={req} />}

      {(req.status === "READY_FOR_PICKUP" || canCancel) && (
        <div className="flex flex-wrap gap-3">
          {req.status === "READY_FOR_PICKUP" && (
            <Button variant="filled" size="lg" onClick={() => setConfirming("pickup")}>รับของแล้ว</Button>
          )}
          {canCancel && (
            <Button variant="outlined" size="lg" onClick={() => setConfirming("cancel")}>ยกเลิกคำขอ</Button>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-status-danger-fg">{error.message}</p>}

      <ConfirmDialog
        open={confirming === "pickup"}
        title="ยืนยันว่ารับของแล้ว"
        message="อุปกรณ์จะย้ายไปอยู่ในรายการที่ต้องคืนของกลุ่ม"
        confirmLabel="ยืนยันรับของ"
        loading={pickup.isPending}
        onCancel={() => setConfirming(null)}
        onConfirm={() => pickup.mutate(req.id, { onSettled: () => setConfirming(null) })}
      />
      <ConfirmDialog
        open={confirming === "cancel"}
        title="ยกเลิกคำขอนี้?"
        message={"ยกเลิกแล้วกู้คืนไม่ได้\nถ้าต้องการยืมใหม่ ต้องส่งคำขอใหม่และต่อคิวท้ายสุด"}
        confirmLabel="ยกเลิกคำขอ"
        loading={cancel.isPending}
        onCancel={() => setConfirming(null)}
        onConfirm={() => cancel.mutate(req.id, { onSettled: () => setConfirming(null) })}
      />
    </div>
  );
}

/** Requests tab: list on the left, the selected request's detail on the right. */
export function MyRequestsPage({
  requests,
  isLoading,
  isError,
  selectedId,
  onSelect,
}: {
  requests: BorrowRequest[];
  isLoading: boolean;
  isError: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (isLoading) return <div className="space-y-2">{Array.from({ length: 3 }, (_, i) => <SkeletonRow key={i} className="h-16" />)}</div>;
  if (isError) return <EmptyState title="โหลดคำขอไม่สำเร็จ" />;
  if (requests.length === 0) return <EmptyState title='ยังไม่มีคำขอ เลือกอุปกรณ์ได้ในแท็บ "ยืมอุปกรณ์"' />;

  const selected = requests.find((r) => r.id === selectedId) ?? requests[0];

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <ul className="space-y-2 lg:w-5/12" aria-label="รายการคำขอ">
        {requests.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onSelect(r.id)}
              aria-current={r.id === selected.id ? "true" : undefined}
              className={cn(
                "w-full rounded-xl border bg-white p-4 text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary",
                r.id === selected.id ? "border-brand-primary ring-1 ring-brand-primary" : "border-neutral-200",
              )}
            >
              <span className="flex items-center gap-2">
                <span className="font-body text-body-sm-emphasize text-grey-900">{r.id}</span>
                <RequestStatusPill req={r} />
              </span>
              <span className="mt-1 block truncate text-xs text-grey-400">
                {r.group} · {r.items.map((i) => `${i.name} ×${i.reqQty}`).join(", ")}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <section className="min-w-0 flex-1">
        <RequestDetail key={selected.id} req={selected} />
      </section>
    </div>
  );
}
