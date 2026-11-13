import { ArrowLeft, CircleCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function StoragePage({
  title,
  subtitle,
  backTo,
  backLabel = "กลับ",
  wide,
  children,
}: {
  title: string;
  subtitle?: string;
  backTo?: string;
  backLabel?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full space-y-6 p-6", wide ? "max-w-6xl" : "max-w-4xl")}>
      <div>
        {backTo && (
          <Link
            to={backTo}
            className="mb-3 inline-flex items-center gap-2 font-body text-body-sm-emphasize text-grey-400 hover:text-grey-900"
          >
            <ArrowLeft className="size-4" aria-hidden="true" /> {backLabel}
          </Link>
        )}
        <h1 className="font-body text-header-xs-emphasize text-grey-900">{title}</h1>
        {subtitle && <p className="mt-1 font-body text-body-sm text-grey-400">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function ResultDialog({
  open,
  title,
  message,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="items-center text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-status-success-bg text-status-success-fg">
          <CircleCheck className="size-9" aria-hidden="true" />
        </div>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="whitespace-pre-line">{message}</DialogDescription>
        {children}
        <DialogFooter className="w-full">
          <Button variant="default" className="w-full" onClick={onClose}>
            ตกลง
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
