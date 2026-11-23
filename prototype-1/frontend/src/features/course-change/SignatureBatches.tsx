import { useActionDraft } from "./useActionDraft";
import { useAuth } from "@/app/AuthProvider";
import { useEffect, useState } from "react";
import {
  useCcSignatureBatches,
  useCreateCcSignatureBatch,
  useLookupCcSignatureBatch,
  type CcSignatureBatch,
  type CcRequest,
} from "@/api/courseChange";
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
import { PortalDialogContent, PortalErrorState } from "./PortalUI";
import { csvCell, requestErrorMessage } from "./requestTools";
import { fmtDate } from "./shared";
export function canCollectSignatures(rows: CcRequest[]) {
  const first = rows[0];
  return (
    !!first?.workflowPlan?.scheduleId &&
    rows.length <= 50 &&
    rows.every(
      (r) =>
        r.phase === "awaiting_signature" &&
        r.status === "processing" &&
        r.courseId === first.courseId &&
        r.section === first.section &&
        r.requestType === first.requestType &&
        r.workflowPlan?.scheduleId === first.workflowPlan?.scheduleId,
    )
  );
}
function download(batch: CcSignatureBatch) {
  const rows: unknown[][] = [
    [
      "ชุดขอลงนาม",
      "ส่งให้",
      "วันที่ส่ง",
      "เลขคำร้อง",
      "รหัสนิสิต",
      "นิสิต",
      "รหัสวิชา",
      "รายวิชา",
      "ตอนเรียน",
      "รอบ",
      "เหตุผล",
    ],
  ];
  for (const r of batch.summary)
    rows.push([
      batch.id,
      batch.recipient,
      batch.sentOn,
      r.requestNo,
      r.studentNo,
      r.studentName,
      r.courseCode,
      r.courseName,
      r.section,
      r.scheduleLabel,
      r.reason,
    ]);
  const url = URL.createObjectURL(
    new Blob(
      ["\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    ),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `signature-${batch.id}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function SignatureBatchHistory() {
  const list = useCcSignatureBatches();
  return (
    <details className="rounded-xl border bg-white p-4">
      <summary className="cursor-pointer text-sm font-medium">
        ชุดที่บันทึกส่งขอลงนาม · ล่าสุด 20 ชุด
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        {list.isError ? (
          <PortalErrorState onRetry={() => void list.refetch()} />
        ) : list.isPending ? (
          <p className="text-sm">กำลังโหลดชุดขอลงนาม…</p>
        ) : !list.data.items.length ? (
          <p className="text-sm text-neutral-500">ยังไม่มีชุดที่บันทึกส่ง</p>
        ) : (
          list.data.items.map((batch) => (
            <div
              key={batch.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3 text-sm"
            >
              <div>
                <p className="font-medium">
                  {batch.recipient} · {fmtDate(batch.sentOn)}
                </p>
                <p className="mt-1 text-xs">
                  {batch.summary.length} คำร้อง · รอคืน {batch.pendingCount} ·
                  ดำเนินการต่อแล้ว {batch.returnedCount}
                </p>
                <p className="mt-1 break-all text-xs text-neutral-500">
                  ชุด {batch.id}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-xs text-neutral-600">
                  {batch.note}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => download(batch)}
              >
                ดาวน์โหลดสรุปชุด CSV
              </Button>
            </div>
          ))
        )}
      </div>
    </details>
  );
}
export function SignatureBatchDialog({
  rows,
  today,
  onClose,
}: {
  rows: CcRequest[] | null;
  today: string;
  onClose: () => void;
}) {
  const mutation = useCreateCcSignatureBatch();
  const lookup = useLookupCcSignatureBatch();
  const { user } = useAuth();
  const draft = useActionDraft(
    user?.id ?? "signed-out",
    `signature-batch:${rows
      ?.map((r) => r.id)
      .sort()
      .join(":")}`,
  );
  const [initial] = useState(() =>
    JSON.stringify({ id: crypto.randomUUID(), recipient: "", sentOn: today }),
  );
  useEffect(() => {
    draft.open("batch", initial, 0);
  }, []);
  let fields: { id: string; recipient: string; sentOn: string };
  try {
    fields = JSON.parse(draft.values?.reason ?? initial);
    if (
      !fields ||
      typeof fields !== "object" ||
      typeof fields.id !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(fields.id) ||
      typeof fields.recipient !== "string" ||
      fields.recipient.length > 200 ||
      typeof fields.sentOn !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(fields.sentOn)
    )
      throw new Error("Invalid batch draft");
  } catch {
    fields = JSON.parse(initial);
  }
  const { id, recipient, sentOn } = fields;
  const note = draft.values?.note ?? "";
  const setRecipient = (recipient: string) =>
    draft.update({ reason: JSON.stringify({ ...fields, recipient }) });
  const setSentOn = (sentOn: string) =>
    draft.update({ reason: JSON.stringify({ ...fields, sentOn }) });
  const setNote = (note: string) => draft.update({ note });
  const [error, setError] = useState("");
  const [result, setResult] = useState<CcSignatureBatch | null>(null);
  const [closing, setClosing] = useState(false);
  const busy = mutation.isPending || lookup.isPending;
  const close = () => {
    if (draft.dirty && !result) setClosing(true);
    else onClose();
  };
  return (
    <>
      <Dialog
        open={!!rows}
        onOpenChange={(open) => {
          if (!open && !busy) close();
        }}
      >
        <PortalDialogContent busy={busy}>
          <DialogHeader>
            <DialogTitle>
              {result
                ? "บันทึกชุดขอลงนามแล้ว"
                : `บันทึกส่งขอลงนาม ${rows?.length ?? 0} คำร้อง`}
            </DialogTitle>
            <DialogDescription>
              บันทึกการส่งที่ดำเนินการภายนอกแล้ว ไม่ส่ง Outlook หรืออีเมลให้เอง
              และยังไม่ใช่การลงนาม
            </DialogDescription>
          </DialogHeader>
          {result ? (
            <div className="space-y-3 text-sm">
              <p>
                ส่งให้ {result.recipient} วันที่ {fmtDate(result.sentOn)}
              </p>
              <p className="break-all text-xs">เลขชุด {result.id}</p>
              <Button variant="outline" onClick={() => download(result)}>
                ดาวน์โหลดสรุปชุด CSV
              </Button>
            </div>
          ) : (
            <>
              <ul className="max-h-48 space-y-2 overflow-y-auto text-xs">
                {rows?.map((r) => (
                  <li key={r.id} className="rounded-lg border p-2">
                    {r.requestNo} · {r.studentName} · {r.courseCode} · ตอน{" "}
                    {r.section ?? "ยังไม่ทราบ"}
                  </li>
                ))}
              </ul>
              <label className="flex flex-col gap-1 text-sm">
                ส่งให้ผู้ใด / หน่วยงานใด
                <Input
                  disabled={busy}
                  maxLength={200}
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                วันที่ส่งจริง
                <Input
                  type="date"
                  max={today}
                  disabled={busy}
                  value={sentOn}
                  onChange={(e) => setSentOn(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                รายละเอียด / ช่องทางหรือเลขอ้างอิง
                <Textarea
                  rows={3}
                  maxLength={1000}
                  disabled={busy}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
            </>
          )}
          {!result && draft.dirty && (
            <p role="status" className="text-xs leading-relaxed">
              {draft.storageError
                ? "ยังเก็บร่างไม่ได้ กรุณาคัดลอกข้อความก่อนปิด"
                : "เก็บร่างในแท็บนี้ 24 ชั่วโมง แยกตามบัญชีและชุดคำร้อง ไม่ส่งเอง"}
            </p>
          )}
          {!result && (draft.restored || error) && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                lookup.mutate(id, {
                  onSuccess: (batch) => {
                    if (batch) {
                      draft.clear();
                      setResult(batch);
                      setError("");
                    } else
                      setError(
                        "ยังไม่พบชุดที่บันทึกด้วยรหัสนี้ ตรวจข้อมูลและยืนยันอีกครั้งได้",
                      );
                  },
                  onError: (e) =>
                    setError(
                      requestErrorMessage(e, "ตรวจผลการบันทึกไม่สำเร็จ"),
                    ),
                })
              }
            >
              ตรวจผลการบันทึกชุดเดิม
            </Button>
          )}
          {error && (
            <p role="alert" className="text-sm">
              {error}
            </p>
          )}
          <DialogFooter className="cc-dialog-actions">
            <Button variant="outline" disabled={busy} onClick={close}>
              {result ? "ปิด" : "กลับ"}
            </Button>
            {!result && (
              <Button
                disabled={
                  busy ||
                  !draft.values ||
                  !rows ||
                  !canCollectSignatures(rows) ||
                  recipient.trim().length < 3 ||
                  note.trim().length < 5 ||
                  !sentOn ||
                  sentOn > today
                }
                onClick={() =>
                  mutation.mutate(
                    {
                      id,
                      items: rows!.map((r) => ({
                        id: r.id,
                        revision: r.revision!,
                      })),
                      recipient: recipient.trim(),
                      sentOn,
                      note: note.trim(),
                    },
                    {
                      onSuccess: (batch) => {
                        draft.clear();
                        setError("");
                        setResult(batch);
                      },
                      onError: (e) =>
                        setError(
                          requestErrorMessage(
                            e,
                            "ยังยืนยันการบันทึกไม่ได้ กรุณาลองอีกครั้งด้วยข้อมูลชุดเดิม",
                          ),
                        ),
                    },
                  )
                }
              >
                {mutation.isPending
                  ? "กำลังบันทึก…"
                  : "ยืนยันว่าดำเนินการส่งแล้ว"}
              </Button>
            )}
          </DialogFooter>
        </PortalDialogContent>
      </Dialog>
      <Dialog open={closing} onOpenChange={setClosing}>
        <PortalDialogContent>
          <DialogHeader>
            <DialogTitle>มีข้อความชุดขอลงนามที่ยังไม่ส่ง</DialogTitle>
            <DialogDescription>
              {draft.storageError
                ? "ยังเก็บร่างไม่ได้ กรุณาคัดลอกข้อมูลก่อนปิด"
                : "เก็บร่างไว้ในแท็บนี้ เลือกคำร้องชุดเดิมเพื่อกลับมาแก้ไขต่อ"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClosing(false)}>
              แก้ไขต่อ
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                draft.clear();
                onClose();
              }}
            >
              ล้างร่างและปิด
            </Button>
            <Button disabled={draft.storageError} onClick={onClose}>
              เก็บร่างและปิด
            </Button>
          </DialogFooter>
        </PortalDialogContent>
      </Dialog>
    </>
  );
}
