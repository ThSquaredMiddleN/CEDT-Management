import { CircleCheck, Lock, User, Users } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { EmptyState, Spinner } from "@/components/states";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useQCRequest, useSubmitQC, useVerifySlip } from "../api/hooks";
import { ResultDialog, StoragePage } from "../components/layout";
import { LIABILITY_FORM_ID, LiabilityForm, type LiabilityValues } from "../components/LiabilityForm";
import { PromptPayQR } from "../components/PromptPayQR";
import { QCItemRow } from "../components/QCItemRow";
import type { QCItemStatus, QCRequest } from "../types";

type Decision = Exclude<QCItemStatus, "PENDING_TEST">;

type Outcome = { title: string; message: string; qrAmount?: number };

function InspectView({ req, onDone }: { req: QCRequest; onDone: (o: Outcome) => void }) {
  const submitQC = useSubmitQC();
  const readOnly = req.status === "CLOSED";
  const [statuses, setStatuses] = useState<Record<string, QCItemStatus>>(() =>
    Object.fromEntries(req.items.map((i) => [i.id, i.status])),
  );

  const items = req.items.map((i) => ({ ...i, status: statuses[i.id] ?? i.status }));
  const allProcessed = items.every((i) => i.status !== "PENDING_TEST");
  const hasLiability = items.some((i) => i.status === "DAMAGED" || i.status === "LOST");

  const send = (fineAmount: number, fineRemark: string) =>
    submitQC.mutate(
      {
        id: req.id,
        submission: {
          items: items.map((i) => ({ id: i.id, status: i.status as Decision })),
          fineAmount,
          fineRemark,
        },
      },
      {
        onSuccess: ({ status }) =>
          onDone(
            status === "CLOSED"
              ? { title: "ปิดงานสมบูรณ์", message: "อุปกรณ์ทั้งหมดปกติดี Task เปลี่ยนเป็น CLOSED" }
              : {
                  title: "สร้างบิลสำเร็จ",
                  message: "Task เปลี่ยนสถานะเป็น PENDING_PAYMENT และส่ง QR Code ให้กลุ่มเรียบร้อย (Task ยังไม่ปิด)",
                  qrAmount: fineAmount,
                },
          ),
      },
    );

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white md:flex-row">
        <div className={cn("flex flex-col p-6 text-white md:w-1/3", readOnly ? "bg-slate-600" : "bg-slate-900")}>
          <h2 className="mb-4 font-body text-header-xs-emphasize text-orange-400">QC & ปรับไหม</h2>
          <div className="rounded-xl border border-white/10 bg-white/10 p-5">
            <p className="mb-1 text-xs uppercase tracking-wider text-slate-300">กลุ่มที่ทำรายการ</p>
            <p className="mb-4 flex items-center gap-2 font-bold"><Users className="size-4 text-orange-400" /> {req.group}</p>
            <p className="mb-1 text-xs uppercase tracking-wider text-slate-300">ผู้ส่งคืน</p>
            <p className="flex items-center gap-2 text-sm font-bold"><User className="size-4 text-orange-400" /> {req.user}</p>
          </div>
        </div>

        <div className="space-y-6 p-6 md:w-2/3">
          {readOnly && (
            <div className="flex gap-3 rounded-lg border border-neutral-300 bg-neutral-100 p-3 text-sm text-grey-700">
              <Lock className="mt-0.5 size-4" aria-hidden="true" />
              <p>รายการนี้ถูกตรวจสอบและปิดงานเรียบร้อยแล้ว (Read-only View)</p>
            </div>
          )}
          <div>
            <h3 className="mb-4 border-b pb-2 font-body text-body-md-emphasize text-grey-900">รายการรอตรวจสอบ</h3>
            <div className="space-y-4">
              {items.map((item) => (
                <QCItemRow
                  key={item.id}
                  item={item}
                  readOnly={readOnly}
                  onChange={(s) => setStatuses((p) => ({ ...p, [item.id]: s }))}
                />
              ))}
            </div>
          </div>

          {!readOnly && hasLiability && (
            <LiabilityForm onSubmit={(v: LiabilityValues) => send(v.amount, v.remark)} />
          )}

          {submitQC.isError && <p role="alert" className="text-sm text-red-600">{(submitQC.error as Error).message}</p>}

          {!readOnly && (
            <Button
              variant="default"
              size="lg"
              className={cn("w-full", hasLiability && "bg-red-600 hover:bg-red-700")}
              disabled={!allProcessed || submitQC.isPending}
              loading={submitQC.isPending}
              // With liability the form (zod-validated) submits; otherwise close directly.
              {...(hasLiability
                ? { type: "submit" as const, form: LIABILITY_FORM_ID }
                : { type: "button" as const, onClick: () => send(0, "") })}
            >
              {hasLiability ? "บันทึกและส่งบิลเรียกเก็บเงินกลุ่มนี้" : "บันทึก QC และปิดงานทันที"}
            </Button>
          )}
        </div>
    </div>
  );
}

function SlipVerifyView({ req, onDone }: { req: QCRequest; onDone: (o: Outcome) => void }) {
  const verify = useVerifySlip();
  const slip = req.slip;

  const act = (valid: boolean) =>
    verify.mutate(
      { id: req.id, valid },
      {
        onSuccess: () =>
          onDone(
            valid
              ? { title: "ตรวจสอบผ่าน", message: "ปิดงาน (CLOSED) สมบูรณ์ สต็อกได้รับการอัปเดต" }
              : { title: "ปฏิเสธสลิป", message: "แจ้งเตือนกลับไปยังกลุ่มเพื่อให้อัปโหลดใหม่" },
          ),
      },
    );

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="flex items-center justify-between bg-orange-600 p-5 text-white">
          <h2 className="font-body text-body-md-emphasize">ตรวจสอบสลิปโอนเงิน (PENDING_PAYMENT)</h2>
          <span className="rounded-lg bg-white/20 px-3 py-1 text-sm font-bold">{req.group}</span>
        </div>
        <div className="flex flex-col gap-10 p-8 md:flex-row">
          <div className="flex w-full justify-center md:w-1/2">
            <div className="flex aspect-[3/5] w-full max-w-sm flex-col items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 p-2 text-center text-grey-200">
              <p className="font-bold">Bank Slip</p>
              <p>{(slip?.amount ?? req.fineAmount).toFixed(2)} THB</p>
              <p className="mt-2 text-xs">(พื้นที่แสดงรูปสลิปที่นิสิตอัปโหลด)</p>
            </div>
          </div>
          <div className="flex w-full flex-col justify-center md:w-1/2">
            <h3 className="mb-6 border-b pb-4 font-body text-header-xs-emphasize text-grey-900">ยืนยันยอดชำระ</h3>
            <dl className="mb-4 space-y-4 rounded-xl border border-neutral-200 bg-neutral-50 p-6">
              <div className="flex items-center justify-between">
                <dt className="text-grey-400">ยอดเรียกเก็บ:</dt>
                <dd className="text-xl font-bold text-red-600">{req.fineAmount.toLocaleString()}.00 บาท</dd>
              </div>
              {slip && (
                <>
                  <div className="flex items-center justify-between"><dt className="text-grey-400">วันที่โอน:</dt><dd>{slip.transferredAt}</dd></div>
                  <div className="flex items-center justify-between"><dt className="text-grey-400">รหัสอ้างอิง:</dt><dd className="font-mono text-grey-400">{slip.refCode}</dd></div>
                </>
              )}
              {req.fineRemark && (
                <div className="flex items-start justify-between gap-4"><dt className="text-grey-400">เหตุผล:</dt><dd className="text-right">{req.fineRemark}</dd></div>
              )}
            </dl>

            <div className="mb-4 flex items-center gap-4 rounded-xl border border-neutral-200 p-4">
              <PromptPayQR amount={req.fineAmount} size={96} />
              <p className="text-xs text-grey-400">QR PromptPay ที่ส่งให้นิสิต ใช้เทียบยอดกับสลิป</p>
            </div>

            {verify.isError && <p role="alert" className="mb-3 text-sm text-red-600">{(verify.error as Error).message}</p>}
            <div className="space-y-3">
              <Button className="w-full bg-green-600 hover:bg-green-700" size="lg" disabled={verify.isPending} onClick={() => act(true)}>
                <CircleCheck className="size-5" aria-hidden="true" /> สลิปถูกต้อง กดปิดงาน (CLOSED)
              </Button>
              <Button variant="outline" size="lg" className="w-full border-2 border-red-500 text-red-600 hover:bg-red-50" disabled={verify.isPending} onClick={() => act(false)}>
                สลิปไม่ถูกต้อง แจ้งตีกลับ
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export function QCDetailPage() {
  const { id = "" } = useParams();
  const { data, isError } = useQCRequest(id);
  const navigate = useNavigate();
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  return (
    <StoragePage title="QC & Liability" backTo="/admin/storage/qc" backLabel="กลับหน้ารายการ QC">
      {isError ? (
        <EmptyState title="ไม่พบรายการ QC" />
      ) : !data ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : data.status === "PENDING_PAYMENT" ? (
        <SlipVerifyView req={data} onDone={setOutcome} />
      ) : (
        <InspectView req={data} onDone={setOutcome} />
      )}
      <ResultDialog
        open={outcome !== null}
        title={outcome?.title ?? ""}
        message={outcome?.message ?? ""}
        onClose={() => navigate("/admin/storage/qc")}
      >
        {outcome?.qrAmount ? (
          <div className="flex flex-col items-center gap-2">
            <PromptPayQR amount={outcome.qrAmount} />
            <p className="text-sm font-bold text-red-600">{outcome.qrAmount.toLocaleString()} บาท</p>
          </div>
        ) : null}
      </ResultDialog>
    </StoragePage>
  );
}
