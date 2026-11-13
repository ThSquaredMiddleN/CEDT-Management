import { PhaseWait } from "./PhaseWait";
import { useActionDraft } from "./useActionDraft";
import { useEffect, useState } from "react";
import { useAuth } from "@/app/AuthProvider";
import { useToast } from "@/app/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { PortalDialogContent } from "./PortalUI";
import {
  ccFileUrl,
  useCcWorkflow,
  useCcUpload,
  useCcMerge,
  type CcRequestDetail,
} from "@/api/courseChange";
import { requestErrorMessage } from "./requestTools";
import { fmtDateTime } from "./shared";

export const PHASE_LABELS: Record<string, string> = {
  staff_review: "เจ้าหน้าที่ตรวจคำร้อง",
  student_revision: "รอนิสิตแก้ไขคำร้อง",
  awaiting_signature: "รวบรวมและรอเอกสารลงนาม",
  student_external: "รอนิสิตดำเนินการภายนอก",
  ready_registrar: "รอหลักสูตรส่ง สนท.",
  awaiting_result: "เอกสารครบ · รอผลทะเบียน",
  completed: "เจ้าหน้าที่บันทึกผลทะเบียนแล้ว",
};
const ACTIONS: Record<string, string> = {
  reject: "ไม่รับดำเนินการ",
  request_documents: "ขอแก้เอกสาร / หลักฐาน",
  request_revision: "ส่งกลับแก้ไข",
  resubmit: "ส่งคำร้องฉบับแก้ไข",
  review: "ตรวจข้อมูลครบแล้ว",
  signature_sent: "บันทึกส่งขอลงนาม",
  return_signed: "คืนเอกสารที่ลงนามแล้ว",
  reg_done: "บันทึกว่าทำ Reg Chula แล้ว",
  pi_done: "บันทึกว่าส่ง PI แล้ว",
  documents_checked: "ตรวจเอกสารและงานนิสิตครบแล้ว",
  registrar_sent: "บันทึกส่ง สนท. แล้ว",
  complete: "บันทึกผลทะเบียนสำเร็จ",
};
const FILE_LABELS: Record<string, string> = {
  student_petition: "คำร้องประกอบ",
  signed_petition: "คำร้องที่ลงนามแล้ว",
  reg_petition: "เอกสารจาก Reg Chula",
  evidence: "หลักฐานประกอบ",
  merged: "PDF รวมสองฉบับ",
};

export function WorkflowPanel({ r }: { r: CcRequestDetail }) {
  const { user } = useAuth();
  const toast = useToast();
  const workflow = useCcWorkflow();
  const upload = useCcUpload();
  const merge = useCcMerge();
  const [chosen, setChosen] = useState<string | null>(null);
  const draft = useActionDraft(user?.id ?? "signed-out", r.id);
  const note = draft.values?.note ?? "";
  const reason = draft.values?.reason ?? r.reason;
  const [closingAction, setClosingAction] = useState(false);
  const closeAction = () => {
    if (draft.dirty) setClosingAction(true);
    else setChosen(null);
  };
  const [error, setError] = useState("");
  const [kind, setKind] = useState(
    user?.role === "staff" ? "signed_petition" : "student_petition",
  );
  const [file, setFile] = useState<File | null>(null);
  useEffect(() => {
    if (!file) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [file]);
  const [fileKey, setFileKey] = useState(0);
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [mergeReview, setMergeReview] = useState(false);
  const plan = r.workflowPlan!;
  const staff = user?.role === "staff";
  const busy = workflow.isPending || upload.isPending || merge.isPending;
  const active = ["pending_approval", "processing"].includes(r.status);
  const boundary = r.events
    .map((e) => e.payload?.action)
    .lastIndexOf("request_documents");
  const was = (action: string) =>
    r.events
      .slice(Math.max(0, boundary))
      .some((e) => e.payload?.action === action);
  const options: string[] = !active
    ? []
    : staff
      ? r.phase === "staff_review"
        ? ["request_revision", "reject", "review"]
        : r.phase === "awaiting_signature"
          ? ["signature_sent", "return_signed"]
          : r.phase === "student_external"
            ? ["request_documents", "documents_checked"]
            : r.phase === "ready_registrar"
              ? ["registrar_sent"]
              : r.phase === "awaiting_result"
                ? ["request_documents", "complete"]
                : []
      : r.phase === "student_revision"
        ? ["resubmit"]
        : r.phase === "student_external"
          ? [
              ...(plan.needsReg && !was("reg_done") ? ["reg_done"] : []),
              ...(plan.needsPi && !was("pi_done") ? ["pi_done"] : []),
            ]
          : [];
  const files = r.files ?? [];
  const feedback = r.events
    .filter((e) =>
      ["request_revision", "request_documents"].includes(
        String(e.payload?.action),
      ),
    )
    .at(-1)?.note;
  const requiredNote =
    chosen &&
    [
      "request_revision",
      "reject",
      "request_documents",
      "signature_sent",
      "return_signed",
      "reg_done",
      "pi_done",
      "registrar_sent",
      "complete",
    ].includes(chosen);
  const canUpload =
    active &&
    (staff ||
      ["staff_review", "student_revision", "student_external"].includes(
        r.phase ?? "",
      ));
  const availableKinds = staff
    ? [
        ...(r.phase === "awaiting_signature" ? ["signed_petition"] : []),
        "evidence",
      ]
    : ["student_petition", "reg_petition", "evidence"];
  const selectedKind = availableKinds.includes(kind) ? kind : availableKinds[0];
  const fail = (e: unknown) =>
    setError(requestErrorMessage(e, "บันทึกไม่สำเร็จ กรุณาลองใหม่"));
  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-4">
      <div>
        <h3 className="font-semibold">
          {!active
            ? r.status === "rejected"
              ? "คำร้องไม่อนุมัติ"
              : r.status === "cancelled"
                ? "คำร้องยกเลิกแล้ว"
                : "เจ้าหน้าที่บันทึกผลทะเบียนแล้ว"
            : (PHASE_LABELS[r.phase ?? ""] ?? "ขั้นตอนคำร้อง")}
        </h3>
        <p className="mt-1 text-xs text-neutral-600">
          {plan.label} ·{" "}
          {plan.format === "block" ? "Block Course" : "เต็มภาคการศึกษา"} ·
          กำหนดที่บันทึกไว้ตอนยื่น
        </p>
      </div>
      <PhaseWait r={r} />
      <ol className="flex flex-col gap-2 text-sm">
        {[
          {
            label: "เจ้าหน้าที่ตรวจคำร้อง",
            done: !["staff_review", "student_revision"].includes(r.phase ?? ""),
          },
          ...(plan.needsSignature
            ? [
                {
                  label: "รับคำร้องที่ลงนามแล้ว",
                  done: files.some((f) => f.kind === "signed_petition"),
                },
              ]
            : []),
          ...(plan.needsReg
            ? [{ label: "นิสิตบันทึกการทำ Reg Chula", done: was("reg_done") }]
            : []),
          ...(plan.needsMerge
            ? [
                {
                  label: "รวม PDF สองฉบับและตรวจไฟล์",
                  done: was("files_merged"),
                },
              ]
            : []),
          ...(plan.needsPi
            ? [{ label: "นิสิตบันทึกการส่ง PI", done: was("pi_done") }]
            : []),
          ...(plan.registrar
            ? [{ label: "หลักสูตรบันทึกส่ง สนท.", done: was("registrar_sent") }]
            : []),
          {
            label: "ตรวจครบและรอผลทะเบียน",
            done: r.phase === "awaiting_result" || r.status === "completed",
          },
          {
            label: "เจ้าหน้าที่บันทึกผลทะเบียนพร้อมหลักฐานอ้างอิง",
            done: r.status === "completed",
          },
        ].map((s, i) => (
          <li key={s.label} className="flex gap-2">
            <span
              aria-label={s.done ? "บันทึกแล้ว" : "ยังไม่บันทึก"}
              className="shrink-0 text-neutral-500"
            >
              {s.done ? "✓" : `${i + 1}.`}
            </span>
            <span>{s.label}</span>
          </li>
        ))}
      </ol>
      <p className="text-xs leading-relaxed text-neutral-500">
        การบันทึก Reg Chula / PI เป็นข้อมูลที่นิสิตแจ้ง
        เจ้าหน้าที่ต้องตรวจหลักฐานอีกครั้ง ระบบยังไม่รับผลอัตโนมัติจากทะเบียน
      </p>
      {(r.phase === "student_revision" ||
        (r.phase === "student_external" && boundary >= 0)) && (
        <div className="rounded-lg border-2 border-neutral-700 p-3">
          <p className="text-sm font-medium">สิ่งที่เจ้าหน้าที่ขอให้แก้ไข</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{feedback}</p>
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg border-2 border-neutral-900 p-3 text-sm"
        >
          {error}
        </p>
      )}
      {!!options.length && (
        <div className="flex flex-wrap gap-2">
          {options.map((a) => (
            <Button
              key={a}
              variant={
                ["request_revision", "request_documents", "reject"].includes(a)
                  ? "outline"
                  : "default"
              }
              disabled={busy}
              onClick={() => {
                setError("");
                draft.open(a, r.reason, r.revision!);
                setChosen(a);
              }}
            >
              {ACTIONS[a]}
            </Button>
          ))}
        </div>
      )}
      <div className="border-t pt-4">
        <h4 className="text-sm font-medium">ไฟล์เอกสารและประวัติฉบับ</h4>
        <p className="mt-1 text-xs text-neutral-500">
          ไฟล์ต้นฉบับยังอยู่เมื่อเพิ่มฉบับใหม่ การแนบไฟล์ไม่ได้รับรองลายมือชื่อ
        </p>
        {!files.length ? (
          <p className="mt-3 text-sm text-neutral-500">ยังไม่มีไฟล์แนบ</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {files.map((f) => (
              <li key={f.id} className="min-w-0 rounded-lg border p-3 text-xs">
                <a
                  href={ccFileUrl(r.id, f.id)}
                  className="break-words font-medium underline underline-offset-4"
                >
                  {f.filename}
                </a>
                <p className="mt-1 text-neutral-500">
                  {FILE_LABELS[f.kind] ?? f.kind} · {fmtDateTime(f.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
      {canUpload && (
        <form
          className="flex flex-col gap-3 rounded-lg bg-neutral-50 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!file) return;
            setError("");
            upload.mutate(
              { id: r.id, revision: r.revision!, kind: selectedKind, file },
              {
                onSuccess: () => {
                  setFile(null);
                  setFileKey((v) => v + 1);
                  toast("แนบไฟล์แล้ว");
                },
                onError: fail,
              },
            );
          }}
        >
          <label className="flex flex-col gap-1 text-xs">
            ประเภทเอกสาร
            <select
              className="h-10 rounded-md border bg-white px-2 text-sm"
              value={selectedKind}
              disabled={busy}
              onChange={(e) => setKind(e.target.value)}
            >
              {availableKinds.map((k) => (
                <option key={k} value={k}>
                  {FILE_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs">
            ไฟล์ PDF ไม่เกิน 5 MB · ไม่เข้ารหัส
            <Input
              key={fileKey}
              type="file"
              accept="application/pdf,.pdf"
              disabled={busy}
              className="h-auto min-w-0 py-2 text-xs"
              onChange={(e) => {
                const selected = e.target.files?.[0] ?? null;
                if (selected && selected.size > 5 * 1024 * 1024) {
                  setError("ใช้ PDF ขนาดไม่เกิน 5 MB");
                  setFile(null);
                } else {
                  setError("");
                  setFile(selected);
                }
              }}
            />
          </label>
          <Button type="submit" variant="outline" disabled={!file || busy}>
            {upload.isPending ? "กำลังแนบไฟล์…" : "แนบไฟล์ในคำร้อง"}
          </Button>
          <p className="text-xs text-neutral-500">
            ไฟล์ที่เลือกยังไม่ถูกแนบจนกว่าจะกดปุ่ม หากรีโหลดหรือปิดคำร้องก่อนแนบ
            ต้องเลือกไฟล์ใหม่
          </p>
        </form>
      )}
      {!staff &&
        active &&
        r.phase === "student_external" &&
        plan.needsMerge &&
        !was("pi_done") && (
          <div className="flex flex-col gap-3 border-t pt-4">
            <h4 className="text-sm font-medium">
              รวมคำร้องสองฉบับเป็น PDF เดียว
            </h4>
            <p className="text-xs text-neutral-500">
              เลือกไฟล์ตามลำดับที่ต้องการ เก็บต้นฉบับไว้ทั้งสองฉบับ
              หลังรวมให้ดาวน์โหลดตรวจสอบก่อนส่ง PI
            </p>
            {[
              { value: first, set: setFirst, label: "ฉบับที่ 1" },
              { value: second, set: setSecond, label: "ฉบับที่ 2" },
            ].map((field) => (
              <label key={field.label} className="flex flex-col gap-1 text-xs">
                {field.label}
                <select
                  className="h-10 min-w-0 rounded-md border px-2 text-sm"
                  value={field.value}
                  disabled={busy}
                  onChange={(e) => field.set(e.target.value)}
                >
                  <option value="">เลือกเอกสาร</option>
                  {files
                    .filter((f) =>
                      ["signed_petition", "reg_petition"].includes(f.kind),
                    )
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {FILE_LABELS[f.kind]} · {f.filename}
                      </option>
                    ))}
                </select>
              </label>
            ))}
            <Button
              variant="outline"
              disabled={busy || !first || !second || first === second}
              onClick={() => {
                setError("");
                setMergeReview(true);
              }}
            >
              ตรวจลำดับและรวม PDF
            </Button>
          </div>
        )}
      <Dialog
        open={!!chosen}
        onOpenChange={(open) => {
          if (!busy && !open) closeAction();
        }}
      >
        <PortalDialogContent busy={busy}>
          <DialogHeader>
            <DialogTitle>{ACTIONS[chosen ?? ""]}</DialogTitle>
            <DialogDescription>
              {r.requestNo} · {r.courseCode} · {r.studentName}
            </DialogDescription>
          </DialogHeader>
          {draft.dirty && (
            <p
              role="status"
              className="rounded-lg border p-3 text-xs leading-relaxed"
            >
              {draft.storageError
                ? "ยังเก็บฉบับร่างไม่ได้ กรุณาคัดลอกข้อความก่อนปิด"
                : `${draft.restored ? "กู้คืนข้อความที่ยังไม่ส่งแล้ว" : "เก็บข้อความที่ยังไม่ส่งแล้ว"} · ในแท็บนี้ไม่เกิน 24 ชั่วโมง ออกจากระบบจะล้างร่าง ไม่ส่งอัตโนมัติ`}
              {draft.values?.revision !== r.revision &&
                " · ข้อมูลคำร้องเปลี่ยนแล้ว กรุณาตรวจสอบก่อนยืนยัน"}
            </p>
          )}
          <p className="text-sm leading-relaxed">
            {chosen === "complete"
              ? "ยืนยันว่าได้ตรวจผลทะเบียนแล้ว ระบุแหล่งผลหรือเลขอ้างอิง การบันทึกนี้ไม่ใช่ผลตอบกลับอัตโนมัติ"
              : chosen === "review"
                ? "ยืนยันว่าตรวจรหัสวิชา ตอนเรียน รูปแบบ กำหนด และข้อมูลนิสิตครบ การตรวจผ่านไม่ใช่การลงนามหรือผลทะเบียน"
                : chosen === "return_signed"
                  ? "ยืนยันว่าไฟล์ที่แนบเป็นฉบับลงนามที่ถูกต้องและพร้อมให้นิสิตดำเนินการต่อ"
                  : chosen === "documents_checked"
                    ? "ยืนยันว่าได้ตรวจเอกสารและหลักฐานงานนิสิตครบแล้ว คำร้องจะยังรอผลทะเบียน"
                    : chosen === "resubmit"
                      ? "แก้เหตุผลตามที่เจ้าหน้าที่แจ้ง วิชาและกำหนดคำร้องเดิมจะไม่เปลี่ยน"
                      : "ระบุผู้รับผิดชอบ รายละเอียด หรือหลักฐานอ้างอิงที่ตรวจสอบได้ ไม่บันทึกว่าส่งแล้วจนกว่าจะดำเนินการภายนอกจริง"}
          </p>
          {chosen === "resubmit" && (
            <label className="flex flex-col gap-1 text-sm">
              เหตุผลคำร้องฉบับแก้ไข
              <Textarea
                rows={4}
                maxLength={1000}
                disabled={busy}
                value={reason}
                onChange={(e) => draft.update({ reason: e.target.value })}
              />
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm">
            {chosen === "reject"
              ? "เหตุผลที่ไม่รับดำเนินการ"
              : ["request_revision", "request_documents"].includes(chosen ?? "")
                ? "สิ่งที่ต้องแก้ไข"
                : `รายละเอียด / หลักฐานอ้างอิง${requiredNote ? " (อย่างน้อย 5 ตัวอักษร)" : " (ถ้ามี)"}`}
            <Textarea
              rows={3}
              maxLength={1000}
              disabled={busy}
              value={note}
              onChange={(e) => draft.update({ note: e.target.value })}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm">
              {error}
            </p>
          )}
          <DialogFooter className="cc-dialog-actions">
            <Button variant="outline" disabled={busy} onClick={closeAction}>
              กลับ
            </Button>
            <Button
              disabled={
                busy ||
                !!(requiredNote && note.trim().length < 5) ||
                (chosen === "resubmit" && reason.trim().length < 5)
              }
              onClick={() =>
                workflow.mutate(
                  {
                    id: r.id,
                    revision: r.revision!,
                    action: chosen!,
                    note,
                    reason: chosen === "resubmit" ? reason.trim() : undefined,
                  },
                  {
                    onSuccess: () => {
                      draft.clear();
                      setChosen(null);
                      toast("บันทึกขั้นตอนแล้ว");
                    },
                    onError: fail,
                  },
                )
              }
            >
              {workflow.isPending ? "กำลังบันทึก…" : "ยืนยันบันทึก"}
            </Button>
          </DialogFooter>
        </PortalDialogContent>
      </Dialog>
      <Dialog open={closingAction} onOpenChange={setClosingAction}>
        <PortalDialogContent>
          <DialogHeader>
            <DialogTitle>มีข้อความที่ยังไม่ส่ง</DialogTitle>
            <DialogDescription>
              {draft.storageError
                ? "ยังเก็บร่างไม่ได้ การปิดอาจทำให้ข้อความหาย กรุณาคัดลอกไว้ก่อน"
                : "เก็บร่างในแท็บเดิม กลับมาเปิดขั้นตอนนี้เพื่อแก้ไขต่อได้ ไม่ส่งข้อมูลเอง"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="cc-dialog-actions">
            <Button variant="outline" onClick={() => setClosingAction(false)}>
              แก้ไขต่อ
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                draft.clear();
                setClosingAction(false);
                setChosen(null);
              }}
            >
              ล้างร่างและปิด
            </Button>
            <Button
              disabled={draft.storageError}
              onClick={() => {
                setClosingAction(false);
                setChosen(null);
              }}
            >
              เก็บร่างและปิด
            </Button>
          </DialogFooter>
        </PortalDialogContent>
      </Dialog>
      <Dialog
        open={mergeReview}
        onOpenChange={(open) => {
          if (!busy) setMergeReview(open);
        }}
      >
        <PortalDialogContent busy={busy}>
          <DialogHeader>
            <DialogTitle>ตรวจลำดับเอกสารก่อนรวม</DialogTitle>
            <DialogDescription>
              สร้างไฟล์ใหม่และเก็บต้นฉบับไว้
            </DialogDescription>
          </DialogHeader>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            {[first, second].map((id, i) => (
              <li key={i} className="break-words">
                {files.find((f) => f.id === id)?.filename}
              </li>
            ))}
          </ol>
          {error && (
            <p role="alert" className="text-sm">
              {error}
            </p>
          )}
          <DialogFooter className="cc-dialog-actions">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setMergeReview(false)}
            >
              กลับ
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                merge.mutate(
                  { id: r.id, revision: r.revision!, ids: [first, second] },
                  {
                    onSuccess: () => {
                      setMergeReview(false);
                      toast("รวม PDF แล้ว กรุณาดาวน์โหลดตรวจสอบ");
                    },
                    onError: fail,
                  },
                )
              }
            >
              {merge.isPending ? "กำลังรวม…" : "ยืนยันรวม PDF"}
            </Button>
          </DialogFooter>
        </PortalDialogContent>
      </Dialog>
    </section>
  );
}
