import { WorkflowPanel, PHASE_LABELS } from "./WorkflowPanel";
import { ExternalLink } from "lucide-react";
import { ccDocumentUrl, type CcRequestDetail } from "@/api/courseChange";
import { Separator } from "@/components/ui/separator";
import { nextRequestAction } from "./requestTools";
import {
  CcStatusBadge,
  FlowChip,
  StepTracker,
  TYPE_LABEL,
  fmtDate,
  fmtDateTime,
} from "./shared";

const EVENT_LABEL: Record<string, string> = {
  submitted: "ยื่นคำร้อง",
  approved: "อนุมัติ",
  rejected: "ไม่อนุมัติ",
  cancelled: "นิสิตยกเลิกคำร้อง",
  document_generated: "จัดเตรียมเอกสารคำร้องตัวอย่าง",
  sent_to_reg_chula: "จำลองส่งข้อมูลเข้า Reg Chula",
  sent_to_pi: "จำลองส่งคำร้องเข้าระบบ PI",
  forwarded_to_registrar: "บันทึกขั้นตอนส่งต่อ สนท. (จำลอง)",
  completed: "เจ้าหน้าที่บันทึกผลสำเร็จ",
  workflow_updated: "อัปเดตขั้นตอน / เอกสาร",
};

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 break-words">
      <span className="text-xs text-neutral-500">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

/** The body shared by the student's tracking dialog and the staff detail pane. */
export function RequestDetailBody({ r, showStudent }: { r: CcRequestDetail; showStudent?: boolean }) {
  const next = r.workflowVersion === 2 && ["pending_approval", "processing"].includes(r.status) ? { title: PHASE_LABELS[r.phase ?? ""] ?? "ติดตามขั้นตอน", description: "ดูผู้รับผิดชอบ เอกสาร และงานที่ต้องทำในส่วนขั้นตอนคำร้องด้านล่าง" } : nextRequestAction(r.status, r.flow, r.advisorName);
  return (
    <div className="flex min-w-0 flex-col gap-6 break-words">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-mono text-xs text-neutral-500">{r.requestNo}</span>
          <h2 className="text-lg font-semibold tracking-tight">
            {TYPE_LABEL[r.requestType]} · {r.courseCode} {r.courseName}
          </h2>
          {r.workflowVersion !== 2 && <FlowChip flow={r.flow} className="self-start" />}
        </div>
        <CcStatusBadge status={r.status} />
      </div>

      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
        <p className="text-sm font-medium">{next.title}</p>
        <p className="mt-1 text-xs leading-relaxed text-neutral-600">{next.description}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
        {showStudent && (
          <>
            <Fact label="นิสิต">{r.studentName}</Fact>
            <Fact label="รหัสนิสิต">
              <span className="font-mono">{r.studentNo}</span>
            </Fact>
            <Fact label="อาจารย์ที่ปรึกษา">{r.advisorName ?? "—"}</Fact>
          </>
        )}
        <Fact label="ตอนเรียน / หน่วยกิต">
          {r.section ?? "—"} / {r.credits ?? "—"}
        </Fact>
        <Fact label="ยื่นเมื่อ">
          {fmtDate(r.createdAt)} (สัปดาห์ที่ {r.weekNo})
        </Fact>
        <Fact label="ภาคการศึกษา">{r.termLabel}</Fact>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-neutral-500">เหตุผล</span>
        <p className="whitespace-pre-wrap rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">
          {r.reason}
        </p>
      </div>

      {r.status === "rejected" && r.rejectReason && (
        <div className="flex flex-col gap-1 rounded-lg border-2 border-neutral-900 px-3 py-2">
          <span className="text-xs font-medium">เหตุผลที่ไม่อนุมัติ · {r.decidedByName}</span>
          <p className="text-sm">{r.rejectReason}</p>
        </div>
      )}

      {r.workflowVersion === 2 && <WorkflowPanel key={r.id} r={r} />}
      {r.workflowVersion !== 2 && <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            ความคืบหน้า
          </span>
          <StepTracker steps={r.steps} />
        </div>

        <div className="flex flex-col gap-3">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            เอกสารประกอบคำร้อง
          </span>
          {r.hasDocument ? (
            <a
              href={ccDocumentUrl(r.id)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">เปิดเอกสารคำร้องตัวอย่าง</span>
                <span className="text-xs text-neutral-500">เปิดในหน้าต่างใหม่ · ยังใช้ยื่นจริงไม่ได้</span>
              </span>
              <ExternalLink className="size-4 shrink-0 text-neutral-500" />
            </a>
          ) : (
            <p className="text-xs text-neutral-500">
              {r.flow === "advisor_pi"
                ? "เอกสารตัวอย่างจะแสดงที่นี่หลังได้รับการอนุมัติ"
                : "ระบบสาธิตยังไม่มีเอกสารสำหรับเส้นทางนี้"}
            </p>
          )}
          <details className="rounded-lg border border-neutral-200 p-3 text-xs">
            <summary className="cursor-pointer text-neutral-600">ข้อมูลอ้างอิงการส่ง (สาธิต)</summary>
          <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
            <dt className="text-neutral-500">Reg Chula</dt>
            <dd className="min-w-0 break-all font-mono">{r.regChulaRef ?? "—"}</dd>
            <dt className="text-neutral-500">PI</dt>
            <dd className="min-w-0 break-all font-mono">{r.piRef ?? "—"}</dd>
          </dl>
          {r.documentHash && <p className="mt-2 break-all font-mono text-[10px] text-neutral-500">SHA-256 {r.documentHash}</p>}
          </details>
        </div>
      </div>}

      <Separator />

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          ประวัติการดำเนินการ
        </span>
        <ul className="flex flex-col gap-1.5">
          {r.events.map((e) => (
            <li key={e.id} className="grid gap-1 text-xs sm:grid-cols-[110px_minmax(0,1fr)] sm:gap-3">
              <span className="tabular-nums text-neutral-500">{fmtDateTime(e.createdAt)}</span>
              <span>
                {EVENT_LABEL[e.eventType] ?? e.eventType}
                <span className="text-neutral-500"> · {e.actorName}</span>
                {e.note && <span className="text-neutral-500"> — {e.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
