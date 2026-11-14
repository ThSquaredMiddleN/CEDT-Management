import { AlertTriangle, CheckCircle2, CircleX, Info } from "lucide-react";
import type { ReceiptCheckResponse, ReceiptCheckState, ReceiptField, ReceiptVerdict } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Status is texture, not colour (§3.2, see components/states.tsx): solid = ok, dashed = warn, heavy = fail.
const VERDICT_STYLE: Record<ReceiptVerdict, { label: string; Icon: typeof Info; className: string }> = {
  ok: { label: "OK", Icon: CheckCircle2, className: "bg-neutral-900 text-neutral-50" },
  warn: { label: "Review", Icon: AlertTriangle, className: "border-dashed text-neutral-700" },
  fail: { label: "Fail", Icon: CircleX, className: "border-2 border-neutral-900 text-neutral-950" },
};

export function VerdictBadge({ verdict }: { verdict: ReceiptVerdict }) {
  const { label, Icon, className } = VERDICT_STYLE[verdict];
  return (
    <Badge variant={verdict === "ok" ? "default" : "outline"} className={cn("gap-1.5 text-xs", className)}>
      <Icon className="size-3" /> {label}
    </Badge>
  );
}

const STATE_ICON: Record<ReceiptCheckState, { Icon: typeof Info; label: string; className: string }> = {
  ok: { Icon: CheckCircle2, label: "Pass", className: "text-neutral-900" },
  warn: { Icon: AlertTriangle, label: "Warning", className: "text-neutral-700" },
  fail: { Icon: CircleX, label: "Fail", className: "text-neutral-950" },
  info: { Icon: Info, label: "Info", className: "text-neutral-400" },
};

function CheckStateIcon({ state }: { state: ReceiptCheckState }) {
  const { Icon, label, className } = STATE_ICON[state];
  return <Icon role="img" aria-label={label} className={cn("mt-0.5 size-4 shrink-0", className)} />;
}

/** Sidecar field keys behind each row. Reference falls back to the PDF's receipt number. */
const FIELD_ROWS: { label: string; keys: string[] }[] = [
  { label: "Semester", keys: ["semester"] },
  { label: "Amount", keys: ["amount"] },
  { label: "Status", keys: ["status"] },
  { label: "Reference", keys: ["reference", "receipt_no"] },
  { label: "Paid at", keys: ["paid_at"] },
  { label: "Funding", keys: ["funding"] },
  { label: "Name", keys: ["name"] },
  { label: "Student ID", keys: ["student_id"] },
];

function fieldValue(fields: Record<string, ReceiptField>, keys: string[]): string | null {
  for (const key of keys) {
    const value = fields[key]?.value;
    if (value) return value;
  }
  return null;
}

/** Result of one upload. Holds the student's name, so it lives only in the page's state. */
export function ReceiptResult({ result }: { result: ReceiptCheckResponse }) {
  const { check, fields } = result;
  const isScreenshot = check.kind === "screenshot";

  return (
    <Card className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <VerdictBadge verdict={check.verdict} />
        <span className="text-sm text-neutral-500">
          {isScreenshot ? "Screenshot" : "PDF receipt"} · term {check.term}
        </span>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Checks</h2>
        <ul className="flex flex-col gap-2">
          {check.checks.map((c) => (
            <li key={c.name} className="flex items-start gap-3">
              <CheckStateIcon state={c.state} />
              <div className="flex min-w-0 flex-col">
                <span className="text-sm font-medium">{c.name}</span>
                <span className="break-words text-sm text-neutral-500">{c.detail}</span>
              </div>
            </li>
          ))}
        </ul>
        {isScreenshot && check.verdict === "warn" && (
          <p className="text-xs text-neutral-700">
            Only the first digits of the ID are shown; confirm with the name.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Extracted fields</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          {FIELD_ROWS.map(({ label, keys }) => {
            const value = fieldValue(fields, keys);
            return (
              <div key={label} className="flex flex-col gap-0.5">
                <dt className="text-xs text-neutral-500">{label}</dt>
                <dd className="break-words text-sm text-neutral-950">{value ?? "—"}</dd>
                {label === "Name" && (
                  <dd className="text-xs text-neutral-500">Shown for this check only; not saved.</dd>
                )}
              </div>
            );
          })}
        </dl>
      </section>
    </Card>
  );
}
