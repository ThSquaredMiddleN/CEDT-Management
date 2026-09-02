import { AlertCircle, Check, Clock, RotateCcw, X } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BookingStatus } from "@/api/types";

/** Status is texture, not colour (§3.2). No red/green/amber anywhere in this app. */
export function StatusBadge({ status }: { status: BookingStatus }) {
  if (status === "approved") {
    return (
      <Badge className="gap-1.5 bg-neutral-900 text-neutral-50">
        <Check className="size-3" /> Approved
      </Badge>
    );
  }
  if (status === "pending") {
    return (
      <Badge variant="outline" className="gap-1.5 border-dashed text-neutral-500">
        <Clock className="size-3" /> Pending
      </Badge>
    );
  }
  if (status === "rejected") {
    return (
      <Badge variant="outline" className="gap-1.5 border-2 border-neutral-900 text-neutral-950">
        <X className="size-3" /> Rejected
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1.5 text-neutral-500">
      <RotateCcw className="size-3" /> Cancelled
    </Badge>
  );
}

export function SkeletonRow({ className }: { className?: string }) {
  return <div className={cn("h-4 animate-pulse rounded bg-neutral-100", className)} />;
}

export function EmptyState({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <p className="text-sm text-neutral-500">{title}</p>
      {action}
    </div>
  );
}

export function ErrorCard({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-100/50 py-12 text-center">
      <AlertCircle className="size-5 text-neutral-500" />
      <p className="text-sm text-neutral-500">{message ?? "Something went wrong."}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

/** Locks the button width so the label doesn't jump when the spinner appears. */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("size-4 animate-spin", className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
