import { Check, Clock, FileText, RotateCcw, Send, X } from "lucide-react";
import type { ReactNode } from "react";
import type { CcFlow, CcStatus, CcStep, CcType, CcWindow } from "@/api/courseChange";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// --------------------------------------------------------------------- labels

export const TYPE_LABEL: Record<CcType, string> = { drop: "ลดรายวิชา", withdraw: "ถอนรายวิชา" };

export const FLOW_LABEL: Record<CcFlow, { code: string; short: string; long: string }> = {
  reg_direct: {
    code: "A",
    short: "ส่งผ่าน Reg Chula",
    long: "เส้นทางส่งตรง Reg Chula โดยไม่ผ่านหลักสูตร (ระบบสาธิตจำลองการส่ง)",
  },
  advisor_pi: {
    code: "B",
    short: "อาจารย์พิจารณาและเตรียมเอกสาร",
    long: "อาจารย์ที่ปรึกษาอนุมัติ แล้วจัดเตรียมเอกสารตัวอย่างและจำลองส่ง Reg Chula / PI",
  },
  program_registrar: {
    code: "C",
    short: "หลักสูตรพิจารณาและส่ง สนท.",
    long: "หลักสูตรอนุมัติแล้วรวบรวมส่งสำนักงานการทะเบียน (ระบบสาธิตบันทึกขั้นตอนส่งต่อ)",
  },
};

const thDate = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
const thDateTime = new Intl.DateTimeFormat("th-TH", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Bangkok",
});

/** "2026-09-20" or an ISO timestamp → "20 ก.ย. 2569". */
export const fmtDate = (iso: string): string =>
  thDate.format(new Date(iso.length === 10 ? `${iso}T00:00:00+07:00` : iso));

export const fmtDateTime = (iso: string): string => thDateTime.format(new Date(iso));

/** "ตอนเรียน 1 · 3 หน่วยกิต"; unknown parts show "—" (demo enrollments carry neither). */
export const sectionCredits = (section: string | null, credits: number | null): string =>
  `ตอนเรียน ${section ?? "—"} · ${credits ?? "—"} หน่วยกิต`;

// --------------------------------------------------------------------- badges

/** Status is texture, not colour — same rules as the LabSync StatusBadge. */
export function CcStatusBadge({ status }: { status: CcStatus }) {
  switch (status) {
    case "completed":
      return (
        <Badge className="gap-1.5 bg-neutral-900 text-neutral-50">
          <Check className="size-3" /> ดำเนินการสำเร็จ
        </Badge>
      );
    case "processing":
      return (
        <Badge variant="outline" className="stripes-pending-sm gap-1.5 border-neutral-400 text-neutral-900">
          <Send className="size-3" /> กำลังดำเนินการ
        </Badge>
      );
    case "pending_approval":
      return (
        <Badge variant="outline" className="gap-1.5 border-dashed border-neutral-400 text-neutral-600">
          <Clock className="size-3" /> รอพิจารณา
        </Badge>
      );
    case "rejected":
      return (
        <Badge variant="outline" className="gap-1.5 border-2 border-neutral-900 text-neutral-950">
          <X className="size-3" /> ไม่อนุมัติ
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="gap-1.5 text-neutral-500">
          <RotateCcw className="size-3" /> ยกเลิกแล้ว
        </Badge>
      );
  }
}

export function FlowChip({ flow, className }: { flow: CcFlow; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs text-neutral-600",
        className,
      )}
    >
      <FlowSwatch flow={flow} className="size-2.5" />
      {FLOW_LABEL[flow].short}
    </span>
  );
}

/** A = solid, B = stripes, C = light fill. Shared by chips, the timeline and its legend. */
export function FlowSwatch({ flow, className }: { flow: CcFlow; className?: string }) {
  return (
    <span
      className={cn(
        "inline-block shrink-0 rounded-sm",
        flow === "reg_direct" && "bg-neutral-900",
        flow === "advisor_pi" && "stripes-pending-sm border border-neutral-500",
        flow === "program_registrar" && "bg-neutral-300",
        className,
      )}
    />
  );
}

// -------------------------------------------------------- request-type header

/** The Figma "ประเภทคำร้อง" bar — shared shell for the student and staff pages. */
export function RequestTypeBar({
  toggle,
  hint,
  deadline,
  action,
}: {
  toggle: ReactNode;
  hint?: ReactNode;
  deadline?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="cc-surface flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl px-4 py-4 sm:px-5">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-neutral-50">
        <FileText className="size-5" />
      </div>
      <span className="text-base font-semibold">ประเภทคำร้อง</span>
      {toggle}
      {hint && <span className="text-xs text-neutral-500">{hint}</span>}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
        {deadline && <span className="text-sm text-neutral-600">{deadline}</span>}
        {action}
      </div>
    </Card>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled = false,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div role="group" aria-label="ประเภทคำร้อง" className="inline-flex max-w-full flex-wrap rounded-lg bg-neutral-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-950",
            value === o.value
              ? "bg-white font-medium text-neutral-950 shadow-sm"
              : "text-neutral-500 hover:text-neutral-950",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// --------------------------------------------------------------- step tracker

export function StepTracker({ steps, preview = false }: { steps: CcStep[]; preview?: boolean }) {
  return (
    <ol className="flex flex-col">
      {steps.map((s, i) => (
        <li key={s.key} className="relative flex gap-3 pb-5 last:pb-0">
          {i < steps.length - 1 && (
            <span
              className={cn(
                "absolute left-[11px] top-6 h-[calc(100%-24px)] w-px",
                s.state === "done" ? "bg-neutral-900" : "border-l border-dashed border-neutral-300",
              )}
            />
          )}
          <span
            className={cn(
              "relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full transition-colors",
              s.state === "done" && "bg-neutral-900 text-neutral-50",
              s.state === "current" && "border-2 border-neutral-900 bg-white",
              s.state === "halted" && "border-2 border-neutral-900 bg-white text-neutral-900",
              s.state === "upcoming" && "border border-dashed border-neutral-300 bg-white",
            )}
          >
            {s.state === "done" && <Check className="size-3.5" />}
            {s.state === "current" && <span className="size-2 rounded-full bg-neutral-900" />}
            {s.state === "halted" && <X className="size-3.5" />}
          </span>
          <div className="flex min-w-0 flex-col pt-0.5">
            <span
              className={cn(
                "text-sm",
                s.state === "upcoming" ? "text-neutral-500" : "text-neutral-950",
                s.state === "current" && "font-medium",
              )}
            >
              {s.label}
            </span>
            <span className="text-xs text-neutral-500">
              {s.at
                ? fmtDateTime(s.at)
                : s.state === "current"
                  ? preview ? "เริ่มจากขั้นตอนนี้" : "กำลังรอขั้นตอนนี้"
                  : s.state === "halted"
                    ? "หยุดที่ขั้นตอนนี้"
                    : ""}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

// -------------------------------------------------------------- week timeline

/** Weeks 1–18 × {ลด, ถอน}, textured by flow, with this week marked — the routing matrix at a glance. */
export function WeekTimeline({
  windows,
  week,
  maxWeek,
  highlight,
}: {
  windows: CcWindow[];
  week: number;
  maxWeek: number;
  highlight?: CcType;
}) {
  const weeks = Array.from({ length: maxWeek }, (_, i) => i + 1);
  const flowAt = (type: CcType, w: number) =>
    windows.find((x) => x.requestType === type && w >= x.weekFrom && w <= x.weekTo)?.flow;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-xs text-neutral-500 sm:hidden">เลื่อนตารางแนวนอนเพื่อดูครบ 18 สัปดาห์</p>
      <div className="overflow-x-auto rounded-sm focus-visible:outline focus-visible:outline-2" role="region" aria-label="ช่วงเวลาลดและถอนรายวิชา 18 สัปดาห์" tabIndex={0}>
        <div
          className="grid min-w-[640px] items-center gap-x-1 gap-y-1.5"
          style={{ gridTemplateColumns: `72px repeat(${maxWeek}, minmax(0, 1fr))` }}
        >
          <span />
          {weeks.map((w) => (
            <span
              key={w}
              className={cn(
                "text-center text-[10px] tabular-nums",
                w === week ? "font-semibold text-neutral-950" : "text-neutral-400",
              )}
            >
              {w === week ? `▼${w}` : w}
            </span>
          ))}

          {(["drop", "withdraw"] as const).map((type) => (
            <div key={type} className="contents">
              <span
                className={cn(
                  "text-xs",
                  highlight === type ? "font-semibold text-neutral-950" : "text-neutral-500",
                )}
              >
                {TYPE_LABEL[type]}
              </span>
              {weeks.map((w) => {
                const flow = flowAt(type, w);
                return (
                  <span
                    key={w}
                    title={flow ? `สัปดาห์ ${w}: ${FLOW_LABEL[flow].short}` : `สัปดาห์ ${w}: ปิด`}
                    className={cn(
                      "h-6 rounded-sm",
                      !flow && "border border-neutral-200 bg-white",
                      flow === "reg_direct" && "bg-neutral-900",
                      flow === "advisor_pi" && "stripes-pending-sm border border-neutral-400",
                      flow === "program_registrar" && "bg-neutral-300",
                      w === week && "ring-2 ring-neutral-950 ring-offset-1",
                      highlight && highlight !== type && "opacity-40",
                    )}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-neutral-500">
        {(["reg_direct", "advisor_pi", "program_registrar"] as const).map((f) => (
          <span key={f} className="inline-flex items-center gap-1.5">
            <FlowSwatch flow={f} className="size-3" />
            {FLOW_LABEL[f].short}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm border border-neutral-200" /> ปิดรับ
        </span>
      </div>
    </div>
  );
}
