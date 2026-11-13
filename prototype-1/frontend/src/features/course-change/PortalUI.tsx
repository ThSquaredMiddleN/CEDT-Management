import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { AlertCircle, Inbox, RefreshCw, X } from "lucide-react";
import { DialogClose, DialogContent as BaseDialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const PortalDialogContent = forwardRef<HTMLDivElement,
  ComponentPropsWithoutRef<typeof BaseDialogContent> & { busy?: boolean }>(
  ({ children, className, busy, ...props }, ref) => (
    <BaseDialogContent ref={ref} aria-busy={busy || undefined}
      className={cn("cc-dialog max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto", className)} {...props}>
      <DialogClose asChild>
        <button type="button" disabled={busy} aria-label="ปิดหน้าต่าง"
          className="absolute right-3 top-3 z-10 flex size-9 items-center justify-center rounded-full bg-white text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline focus-visible:outline-2 disabled:opacity-40">
          <X className="size-4" />
        </button>
      </DialogClose>
      {children}
    </BaseDialogContent>
  ),
);
PortalDialogContent.displayName = "PortalDialogContent";

export function PortalEmptyState({ title, description, action }: {
  title: string; description?: string; action?: ReactNode;
}) {
  return (
    <div className="cc-panel-enter flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-50"><Inbox className="size-5 text-neutral-500" /></span>
      <p className="text-sm font-medium text-neutral-900">{title}</p>
      {description && <p className="max-w-sm text-sm leading-relaxed text-neutral-500">{description}</p>}
      {action}
    </div>
  );
}

export function PortalErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-neutral-300 bg-neutral-50 px-5 py-8 text-center">
      <AlertCircle className="size-5 text-neutral-600" />
      <p className="text-sm font-medium">{message ?? "โหลดข้อมูลไม่สำเร็จ"}</p>
      <p className="text-xs text-neutral-600">ตรวจสอบการเชื่อมต่อ แล้วลองโหลดข้อมูลอีกครั้ง</p>
      {onRetry && <Button variant="outline" size="sm" onClick={onRetry}><RefreshCw className="size-3.5" />ลองอีกครั้ง</Button>}
    </div>
  );
}

export function SyncIndicator({ updatedAt, refreshing, onRefresh, error }: {
  updatedAt: number; refreshing: boolean; onRefresh: () => void; error?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
      <span className={cn("size-1.5 rounded-full", error ? "border border-neutral-700" : "bg-neutral-500")} aria-hidden />
      <span>{error ? "อัปเดตไม่สำเร็จ · กำลังแสดงข้อมูลล่าสุดที่โหลดได้" : refreshing ? "กำลังอัปเดต…" : updatedAt ? `อัปเดต ${new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(updatedAt)} น. · ตรวจสอบทุก 30 วินาที` : "กำลังโหลดข้อมูล…"}</span>
      <Button variant="ghost" size="icon-sm" disabled={refreshing} onClick={onRefresh} aria-label="อัปเดตข้อมูล" title="อัปเดตข้อมูล">
        <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
      </Button>
    </div>
  );
}
