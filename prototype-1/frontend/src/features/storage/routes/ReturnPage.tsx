import { User } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePendingReturns, useStudentLookup, useSubmitReturn } from "../api/hooks";
import { ResultDialog, StoragePage } from "../components/layout";
import { LIABILITY_FORM_ID, LiabilityForm, type LiabilityValues } from "../components/LiabilityForm";
import { ReturnItemRow, countsTotal, emptyCounts } from "../components/ReturnItemRow";
import type { ReturnCounts } from "../types";

export function ReturnPage() {
  const navigate = useNavigate();
  const [studentId, setStudentId] = useState("6632199921");
  const [groupId, setGroupId] = useState("");
  const [remark, setRemark] = useState("");
  const [counts, setCounts] = useState<Record<string, ReturnCounts>>({});
  const [done, setDone] = useState<string | null>(null);

  const lookup = useStudentLookup();
  const student = lookup.data;
  const pending = usePendingReturns(student?.studentId ?? null);
  const submit = useSubmitReturn();

  const items = pending.data ?? [];
  // Every line must be fully split: counts add up to what the student owes.
  const allProcessed = items.length > 0 && items.every((i) => countsTotal(counts[i.id] ?? emptyCounts()) === i.qty);
  const hasLost = items.some((i) => (counts[i.id]?.LOST ?? 0) > 0);

  const send = (fine?: LiabilityValues) =>
    submit.mutate(
      {
        studentId: student!.studentId,
        results: Object.fromEntries(items.map((i) => [i.id, counts[i.id] ?? emptyCounts()])),
        remark,
        fine: fine ? { amount: fine.amount, remark: fine.remark } : undefined,
      },
      {
        onSuccess: ({ queued, lost }) => {
          setCounts({});
          setDone(
            [
              queued > 0 && `รับคืน ${queued} รายการ เข้าสู่สถานะ PENDING_TEST เพื่อรอคิว QC`,
              lost > 0 && `บันทึกสูญหาย ${lost} รายการ และสร้างบิลค่าปรับ (PENDING_PAYMENT)`,
              items.some((i) => (counts[i.id]?.NOT_BROUGHT ?? 0) > 0) && "รายการที่ไม่ได้นำมายังคงค้างส่ง จะแสดงเป็นอันดับแรกครั้งถัดไป",
            ]
              .filter(Boolean)
              .join(" · "),
          );
        },
      },
    );

  return (
    <StoragePage wide title="รับคืนหน้าเคาน์เตอร์ (Face-to-Face)" backTo="/admin/storage" backLabel="กลับหน้า Dashboard">
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex flex-col gap-4 lg:w-5/12">
          <section className="rounded-xl border border-neutral-200 bg-white p-6">
            <h2 className="mb-4 border-b pb-2 font-body text-body-md-emphasize text-grey-900">ระบุตัวตนผู้คืน</h2>
            <label htmlFor="ret-sid" className="mb-1 block font-body text-body-sm-emphasize text-grey-400">รหัสนิสิต</label>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setCounts({});
                setGroupId("");
                lookup.mutate(studentId, { onSuccess: (s) => setGroupId(s.groups[0]?.id ?? "") });
              }}
            >
              <Input id="ret-sid" value={studentId} onChange={(e) => setStudentId(e.target.value)} className="h-10" />
              <Button type="submit" variant="filled" size="lg" className="px-5" loading={lookup.isPending}>ดึงข้อมูล</Button>
            </form>
            {lookup.isError && <p role="alert" className="mt-2 text-sm text-status-danger-fg">{(lookup.error as Error).message}</p>}

            {student && (
              <div className="mt-4 space-y-3 rounded-lg border border-status-info-border bg-status-info-bg p-4">
                <div>
                  <p className="text-xs text-status-info-fg">พบข้อมูลนิสิต</p>
                  <p className="flex items-center gap-2 font-bold text-status-info-fg"><User className="size-4 text-status-info-fg" /> {student.name} ({student.studentId})</p>
                </div>
                <div>
                  <label htmlFor="ret-group" className="mb-1 block text-xs font-bold text-status-info-fg">
                    เลือกกลุ่มที่ต้องการคืนอุปกรณ์ <span className="text-status-danger-fg">*</span>
                  </label>
                  <select id="ret-group" value={groupId} onChange={(e) => setGroupId(e.target.value)} className="h-9 w-full rounded-md border border-status-info-border bg-white px-2 text-sm font-bold shadow-sm">
                    {student.groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                  </select>
                </div>
              </div>
            )}
          </section>

          {student && (
            <section className="rounded-xl border border-neutral-200 bg-white p-5">
              <label htmlFor="ret-remark" className="mb-2 block font-body text-body-sm-emphasize text-grey-700">Remark บันทึกเพิ่มเติม (Staff)</label>
              <Textarea id="ret-remark" rows={3} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="ระบุสภาพกายภาพเบื้องต้น หากสังเกตเห็นความผิดปกติ..." />
            </section>
          )}
        </div>

        <section className="rounded-xl border border-neutral-200 bg-white p-6 lg:w-7/12">
          <h3 className="mb-4 border-b pb-2 font-body text-body-md-emphasize text-grey-900">รายการที่ค้างส่ง (Pending Return)</h3>
          <div className="min-h-[350px] space-y-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            {!student ? (
              <p className="flex min-h-[300px] items-center justify-center text-sm text-grey-200">ค้นหารหัสนิสิตเพื่อแสดงรายการค้างส่ง</p>
            ) : items.length === 0 ? (
              <p className="flex min-h-[300px] items-center justify-center text-sm text-grey-200">ไม่มีรายการค้างส่ง</p>
            ) : (
              items.map((item) => (
                <ReturnItemRow
                  key={item.id}
                  item={item}
                  counts={counts[item.id]}
                  onChange={(c) => setCounts((p) => ({ ...p, [item.id]: c }))}
                />
              ))
            )}
          </div>

          {hasLost && (
            <div className="mt-4">
              <LiabilityForm onSubmit={(v) => send(v)} />
            </div>
          )}

          {submit.isError && <p role="alert" className="mt-3 text-sm text-status-danger-fg">{(submit.error as Error).message}</p>}
          <Button
            variant="filled" size="lg" className="mt-6 w-full"
            disabled={!allProcessed || submit.isPending} loading={submit.isPending}
            // With a lost item the zod-validated fine form submits; otherwise send directly.
            {...(hasLost
              ? { type: "submit" as const, form: LIABILITY_FORM_ID }
              : { type: "button" as const, onClick: () => send() })}
          >
            {hasLost ? "ยืนยัน และสร้างบิลค่าปรับ" : "ยืนยันรับคืน และส่งเข้าคิว QC"}
          </Button>
        </section>
      </div>

      <ResultDialog open={done !== null} title="บันทึกการรับคืนสำเร็จ" message={done ?? ""} onClose={() => navigate("/admin/storage")} />
    </StoragePage>
  );
}
