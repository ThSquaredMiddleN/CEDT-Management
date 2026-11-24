import { AlertTriangle, CheckCircle2, CircleX, Info } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ApiError } from "@/api/client";
import { useMyReceipts, useUploadMyReceipt } from "@/api/endpoints";
import type { MyReceiptCheck, ReceiptCheckState, ReceiptVerdict } from "@/api/types";
import { EmptyState, ErrorCard, SkeletonRow, Spinner } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const ACCEPT = ACCEPTED_TYPES.join(",");

// Bangkok time, Thai calendar, same as the LINE settings page.
const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(
    new Date(iso),
  );

/** Thai labels for the check names the sidecar sends. An unknown name is shown as it is. */
const CHECK_LABELS: Record<string, string> = {
  "All key fields read": "อ่านข้อมูลสำคัญในใบเสร็จได้ครบ",
  "Payment completed": "ชำระเงินแล้ว",
  "Current semester": "เป็นของภาคการศึกษานี้",
  "Belongs to this student": "เป็นของนิสิตคนนี้",
  "Not submitted before": "ใบเสร็จนี้ยังไม่เคยถูกส่งมาก่อน",
  Funding: "แหล่งทุน",
};

const checkLabel = (name: string) => CHECK_LABELS[name] ?? name;

const VERDICT: Record<ReceiptVerdict, { label: string; Icon: typeof Info; box: string }> = {
  ok: {
    label: "ผ่าน",
    Icon: CheckCircle2,
    box: "border-status-success-border bg-status-success-bg text-status-success-fg",
  },
  warn: {
    label: "รอเจ้าหน้าที่ตรวจ",
    Icon: AlertTriangle,
    box: "border-status-warning-border bg-status-warning-bg text-status-warning-fg",
  },
  fail: {
    label: "ไม่ผ่าน",
    Icon: CircleX,
    box: "border-status-danger-border bg-status-danger-bg text-status-danger-fg",
  },
};

const STATE: Record<ReceiptCheckState, { label: string; Icon: typeof Info; className: string }> = {
  ok: { label: "ผ่าน", Icon: CheckCircle2, className: "text-status-success-fg" },
  warn: { label: "ต้องตรวจสอบ", Icon: AlertTriangle, className: "text-status-warning-fg" },
  fail: { label: "ไม่ผ่าน", Icon: CircleX, className: "text-status-danger-fg" },
  info: { label: "ข้อมูล", Icon: Info, className: "text-neutral-500" },
};

function VerdictPill({ verdict }: { verdict: ReceiptVerdict }) {
  const { label, Icon, box } = VERDICT[verdict];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium", box)}>
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}

/** Client-side checks mirror the server's, so a wrong file is refused before the upload. */
function validateFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return "รองรับเฉพาะไฟล์ PDF, JPG หรือ PNG";
  if (file.size > MAX_BYTES) return "ไฟล์ใหญ่เกิน 10 MB กรุณาเลือกไฟล์ที่เล็กกว่า";
  return null;
}

/** Keyed on the HTTP status: the server's messages are English and not for students. */
function describeUploadError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 400:
        return "กรุณาเลือกไฟล์ใบเสร็จก่อนอัปโหลด";
      case 403:
        return "บัญชีนี้ยังไม่มีเลขประจำตัวนิสิต จึงส่งใบเสร็จไม่ได้ กรุณาติดต่อเจ้าหน้าที่";
      case 413:
        return "ไฟล์ใหญ่เกิน 10 MB กรุณาเลือกไฟล์ที่เล็กกว่า";
      case 415:
        return "รองรับเฉพาะไฟล์ PDF, JPG หรือ PNG";
      case 422:
        return "อ่านใบเสร็จนี้ไม่ได้ ลองอัปโหลดภาพหน้าจอที่ชัดกว่า หรือไฟล์ PDF";
      case 502:
      case 504:
        return "ระบบตรวจใบเสร็จตอบกลับช้าหรือขัดข้อง กรุณาลองใหม่อีกครั้ง";
      case 503:
        return "ระบบตรวจใบเสร็จยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง";
    }
  }
  if (err instanceof TypeError) return "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่";
  return "ตรวจใบเสร็จไม่สำเร็จ กรุณาลองอีกครั้ง";
}

function ResultCard({ check }: { check: MyReceiptCheck }) {
  const needsAction = check.verdict !== "ok";
  return (
    <Card className="flex flex-col gap-5 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <VerdictPill verdict={check.verdict} />
        <span className="text-sm text-neutral-500">
          ภาคการศึกษา {check.term} · {check.kind === "pdf" ? "ไฟล์ PDF" : "ภาพหน้าจอ CU NEX"}
        </span>
      </div>

      <ul className="flex flex-col gap-3">
        {check.checks.map((c) => {
          const { label, Icon, className } = STATE[c.state];
          return (
            <li key={c.name} className="flex items-start gap-3">
              <Icon className={cn("mt-0.5 size-4 shrink-0", className)} aria-hidden="true" />
              <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="text-sm font-medium text-neutral-950">{checkLabel(c.name)}</span>
                <span className={cn("text-sm", className)}>{label}</span>
              </div>
            </li>
          );
        })}
      </ul>

      {needsAction && (
        <p className="rounded-md border border-dashed border-neutral-400 p-3 text-sm text-neutral-700">
          อัปโหลดใบเสร็จที่ชัดกว่าเดิมหรือใบเสร็จที่ถูกต้องอีกครั้ง การอัปโหลดใหม่จะแทนที่รายการนี้
        </p>
      )}
    </Card>
  );
}

export function MyReceiptPage() {
  const [file, setFile] = useState<File | null>(null);
  const [localNotice, setLocalNotice] = useState<string | null>(null);
  const upload = useUploadMyReceipt();
  const list = useMyReceipts();

  const uploading = upload.isPending;
  const notice = localNotice ?? (upload.isError ? describeUploadError(upload.error) : null);
  const items = list.data?.items ?? [];

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file) {
      setLocalNotice("เลือกไฟล์ใบเสร็จก่อนอัปโหลด");
      return;
    }
    const problem = validateFile(file);
    if (problem) {
      setLocalNotice(problem);
      return;
    }
    const form = new FormData();
    form.append("file", file);
    setLocalNotice(null);
    upload.mutate(form);
  };

  return (
    <main className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">ใบเสร็จค่าเทอม</h1>
        <p className="text-sm text-neutral-500">
          อัปโหลดใบเสร็จค่าเทอมของภาคการศึกษานี้ (ไฟล์ PDF จาก CU หรือภาพหน้าจอการชำระเงินใน CU NEX) ระบบไม่เก็บไฟล์
        </p>
      </header>

      <Card className="p-6">
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="my-receipt-file">ไฟล์ใบเสร็จ</Label>
            <Input
              id="my-receipt-file"
              type="file"
              accept={ACCEPT}
              disabled={uploading}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setLocalNotice(null);
              }}
            />
            <p className="text-xs text-neutral-500">PDF, JPG หรือ PNG ไม่เกิน 10 MB</p>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={uploading || !file}>
              {uploading && <Spinner />}
              อัปโหลด
            </Button>
          </div>

          {notice && (
            <div
              role="alert"
              className="rounded-md border-2 border-status-danger-border bg-status-danger-bg p-3 text-sm text-status-danger-fg"
            >
              {notice}
            </div>
          )}
        </form>
      </Card>

      {(upload.data?.check ?? items[0]) && <ResultCard check={upload.data?.check ?? items[0]!} />}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">ที่ส่งแล้ว</h2>
        <Card className="overflow-hidden p-0">
          {list.isPending ? (
            <div className="flex flex-col gap-3 p-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonRow key={i} className="h-8" />
              ))}
            </div>
          ) : list.isError ? (
            <ErrorCard message="โหลดรายการไม่สำเร็จ" onRetry={() => void list.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState title="ยังไม่เคยส่งใบเสร็จ" />
          ) : (
            <ul className="divide-y divide-neutral-200">
              {items.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-neutral-950">ภาคการศึกษา {row.term}</span>
                    <span className="text-xs text-neutral-500">{shortDate(row.createdAt)}</span>
                  </div>
                  <VerdictPill verdict={row.verdict} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </main>
  );
}
