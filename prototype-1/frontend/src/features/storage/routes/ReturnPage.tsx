import { PackageOpen, User, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { usePendingReturns, useStudentLookup, useSubmitReturn } from "../api/hooks";
import { IndexTypeBadge } from "../components/badges";
import { ItemImage } from "../components/ItemImage";
import { itemLabel } from "../components/itemLabel";
import { ResultDialog, StoragePage } from "../components/layout";
import type { ReturnDecision } from "../types";

export function ReturnPage() {
  const navigate = useNavigate();
  const [studentId, setStudentId] = useState("6632199921");
  const [groupId, setGroupId] = useState("");
  const [remark, setRemark] = useState("");
  const [decisions, setDecisions] = useState<Record<string, ReturnDecision>>({});
  const [done, setDone] = useState<string | null>(null);

  const lookup = useStudentLookup();
  const student = lookup.data;
  const pending = usePendingReturns(student?.studentId ?? null);
  const submit = useSubmitReturn();

  const items = pending.data ?? [];
  const allProcessed = items.length > 0 && items.every((i) => decisions[i.id]);

  const choose = (id: string, d: ReturnDecision) => setDecisions((p) => ({ ...p, [id]: d }));

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
                setDecisions({});
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
              items.map((item) => {
                const d = decisions[item.id];
                return (
                  <div key={item.id} className={cn("rounded-lg border border-neutral-200 p-4", d ? "bg-neutral-100" : "bg-white")}>
                    <div className="mb-4 flex items-center gap-3">
                      <ItemImage itemId={item.itemId} name={item.name} />
                      <p className="flex flex-wrap items-center gap-2 font-body text-body-sm-emphasize text-grey-900">
                        {itemLabel(item)} <IndexTypeBadge isUnique={item.isUnique} />
                      </p>
                    </div>
                    <div role="radiogroup" aria-label={`สถานะ ${itemLabel(item)}`} className="flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button" role="radio" aria-checked={d === "RETURNED"}
                        onClick={() => choose(item.id, "RETURNED")}
                        className={cn("flex flex-1 items-center justify-center gap-1 rounded-lg border py-2 text-sm font-bold transition-colors", d === "RETURNED" ? "border-status-info-solid bg-brand-primary text-white" : "border-neutral-300 bg-white text-grey-400 hover:bg-neutral-100")}
                      >
                        <PackageOpen className="size-4" /> รับของคืนแล้ว (รอ QC)
                      </button>
                      <button
                        type="button" role="radio" aria-checked={d === "NOT_BROUGHT"}
                        onClick={() => choose(item.id, "NOT_BROUGHT")}
                        className={cn("flex flex-1 items-center justify-center gap-1 rounded-lg border py-2 text-sm font-bold transition-colors", d === "NOT_BROUGHT" ? "border-grey-400 bg-grey-400 text-white" : "border-neutral-300 bg-white text-grey-400 hover:bg-neutral-100")}
                      >
                        <X className="size-4" /> ไม่ได้นำมา
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {submit.isError && <p role="alert" className="mt-3 text-sm text-status-danger-fg">{(submit.error as Error).message}</p>}
          <Button
            variant="filled" size="lg" className="mt-6 w-full"
            disabled={!allProcessed || submit.isPending} loading={submit.isPending}
            onClick={() =>
              submit.mutate(
                { studentId: student!.studentId, decisions, remark },
                { onSuccess: () => setDone("บันทึกหลักฐานการคืนเรียบร้อย อุปกรณ์เข้าสู่สถานะ PENDING_TEST เพื่อรอคิว QC ต่อไป") },
              )
            }
          >
            ยืนยันรับคืน และส่งเข้าคิว QC
          </Button>
        </section>
      </div>

      <ResultDialog open={done !== null} title="รับคืนเบื้องต้นสำเร็จ" message={done ?? ""} onClose={() => navigate("/admin/storage")} />
    </StoragePage>
  );
}
