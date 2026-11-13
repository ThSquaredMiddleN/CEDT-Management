import { PortalDialogContent as DialogContent, PortalErrorState as ErrorCard } from "./PortalUI";
import { useEffect, useState } from "react";
import { requestErrorMessage } from "./requestTools";
import { useCcSettings, useSaveCcSettings, type CcSettings } from "@/api/courseChange";
import { useToast } from "@/app/toast";
import { SkeletonRow, Spinner } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FLOW_LABEL, TYPE_LABEL, fmtDateTime } from "./shared";

export function SettingsView({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const settings = useCcSettings();
  if (settings.isPending) return <SkeletonRow className="h-48" />;
  if (settings.isError) return <ErrorCard onRetry={() => void settings.refetch()} />;
  return <SettingsEditor key={settings.data.revision} initial={settings.data} reload={() => void settings.refetch()} onDirtyChange={onDirtyChange} />;
}

function SettingsEditor({ initial, reload, onDirtyChange }: { initial: CcSettings; reload: () => void; onDirtyChange: (dirty: boolean) => void }) {
  const toast = useToast();
  const save = useSaveCcSettings();
  const [windows, setWindows] = useState(initial.windows);
  const [courses, setCourses] = useState(initial.courses);
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const dirty = JSON.stringify(windows) !== JSON.stringify(initial.windows) || JSON.stringify(courses) !== JSON.stringify(initial.courses);
  useEffect(() => {
    onDirtyChange(dirty);
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => { onDirtyChange(false); window.removeEventListener("beforeunload", warn); };
  }, [dirty, onDirtyChange]);
  const invalidWeeks = windows.some((w) => !Number.isInteger(w.weekFrom) || !Number.isInteger(w.weekTo) || w.weekFrom < 1 || w.weekTo > 18 || w.weekFrom > w.weekTo);
  const overlaps = windows.some((w, i) => windows.some((other, j) => j < i && w.requestType === other.requestType && w.weekFrom <= other.weekTo && other.weekFrom <= w.weekTo));
  const changedCourses = courses.filter((c, i) => c.allowDrop !== initial.courses[i].allowDrop || c.allowWithdraw !== initial.courses[i].allowWithdraw || c.note !== initial.courses[i].note);
  const visible = courses.filter((c) => `${c.courseCode} ${c.courseName}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const updateCourse = (id: string, patch: Partial<CcSettings["courses"][number]>) =>
    setCourses((prev) => prev.map((c) => c.courseId === id ? { ...c, ...patch } : c));

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold">ตั้งค่าลด / ถอนรายวิชา</h2><p className="text-sm text-neutral-500">{initial.term.label} · มีผลกับคำร้องใหม่ คำร้องเดิมใช้เส้นทางที่บันทึกไว้</p></div>
        <Button disabled={!dirty || invalidWeeks || overlaps || reason.trim().length < 5 || save.isPending} onClick={() => { setError(""); setConfirming(true); }}>ตรวจสอบก่อนบันทึก</Button>
      </div>
      <Card className="flex flex-col gap-4 p-4 sm:p-6">
        <h3 className="font-medium">ช่วงเวลารับคำร้อง</h3>
        <p className="text-xs text-neutral-500">ตารางระดับภาคการศึกษาเดิมสำหรับอ้างอิงเดโม คำร้องใหม่ใช้วันที่ใน “กำหนดรายวิชา / Block” การแก้ตารางนี้ไม่เปิดรับคำร้องใหม่แทนกำหนดรายวิชา</p>
        {windows.map((w, index) => (
          <div key={index} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-[100px_90px_90px_minmax(0,1fr)_auto] lg:items-end">
            <span className="self-center text-sm">{TYPE_LABEL[w.requestType]}</span>
            <label className="flex flex-col gap-1 text-xs">สัปดาห์เริ่ม
              <Input type="number" min={1} max={18} aria-label={`${TYPE_LABEL[w.requestType]} ช่วงที่ ${index + 1} สัปดาห์เริ่ม`} value={w.weekFrom}
                onChange={(e) => setWindows((prev) => prev.map((row, i) => i === index ? { ...row, weekFrom: Number(e.target.value) } : row))} />
            </label>
            <label className="flex flex-col gap-1 text-xs">สัปดาห์สิ้นสุด
              <Input type="number" min={1} max={18} aria-label={`${TYPE_LABEL[w.requestType]} ช่วงที่ ${index + 1} สัปดาห์สิ้นสุด`} value={w.weekTo}
                onChange={(e) => setWindows((prev) => prev.map((row, i) => i === index ? { ...row, weekTo: Number(e.target.value) } : row))} />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs">เส้นทาง
              <select className="h-10 min-w-0 rounded-md border bg-white px-2 text-sm" value={w.flow}
                onChange={(e) => setWindows((prev) => prev.map((row, i) => i === index ? { ...row, flow: e.target.value as typeof w.flow } : row))}>
                {Object.entries(FLOW_LABEL).map(([value, label]) => <option key={value} value={value}>Flow {label.code}: {label.short}</option>)}
              </select>
            </label>
            <Button variant="outline" aria-label={`ลบช่วงที่ ${index + 1}`} onClick={() => setWindows((prev) => prev.filter((_, i) => i !== index))}>ลบช่วง</Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          {(["drop", "withdraw"] as const).map((type) => <Button key={type} variant="outline" disabled={windows.length >= 36}
            onClick={() => setWindows((prev) => [...prev, { requestType: type, weekFrom: 1, weekTo: 1, flow: "reg_direct" }])}>เพิ่มช่วง{TYPE_LABEL[type]}</Button>)}
        </div>
        {(invalidWeeks || overlaps) && <p role="alert" className="text-sm font-medium">{invalidWeeks ? "ช่วงสัปดาห์ต้องเรียงจากน้อยไปมากและอยู่ใน 1–18" : "ช่วงสัปดาห์ของคำร้องประเภทเดียวกันทับซ้อนกัน กรุณาแก้ก่อนบันทึก"}</p>}
      </Card>

      <Card className="flex min-w-0 flex-col gap-4 p-4 sm:p-6">
        <h3 className="font-medium">รายวิชาที่ประกาศเปิดให้ลด / ถอน</h3>
        <p className="text-xs text-neutral-500">นิสิตยังต้องลงทะเบียนรายวิชานั้น และอยู่ในช่วงเวลาที่เปิดรับ จึงจะยื่นได้</p>
        <Input aria-label="ค้นหารายวิชาที่เปิดให้ลดถอน" placeholder="ค้นหารหัสหรือชื่อวิชา" value={search} onChange={(e) => setSearch(e.target.value)} />
        <p className="text-xs text-neutral-500">แสดง {visible.length} จาก {courses.length} รายวิชา</p>
        <div className="flex max-h-[520px] flex-col gap-3 overflow-y-auto">
          {visible.map((c) => <div key={c.courseId} className="flex flex-col gap-3 rounded-lg border p-3">
            <p className="break-words text-sm"><b>{c.courseCode}</b> {c.courseName}{!c.isActive && " (รายวิชาปิดใช้งาน)"}</p>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" aria-label={`${c.courseCode} เปิดให้ลด`} checked={c.allowDrop}
                onChange={(e) => updateCourse(c.courseId, { allowDrop: e.target.checked })} />ลดรายวิชา</label>
              <label className="flex items-center gap-2"><input type="checkbox" aria-label={`${c.courseCode} เปิดให้ถอน`} checked={c.allowWithdraw}
                onChange={(e) => updateCourse(c.courseId, { allowWithdraw: e.target.checked })} />ถอนรายวิชา</label>
            </div>
            <Input aria-label={`${c.courseCode} หมายเหตุประกาศ`} maxLength={500} placeholder="หมายเหตุ เช่น เหตุผลที่ปิดรับ (ไม่บังคับ)" value={c.note ?? ""}
              onChange={(e) => updateCourse(c.courseId, { note: e.target.value || null })} />
          </div>)}
          {!visible.length && <p className="p-4 text-sm text-neutral-500">ไม่พบรายวิชา</p>}
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-4 sm:p-6">
        <label htmlFor="cc-settings-reason" className="font-medium">เหตุผลการแก้ไข</label>
        <Textarea id="cc-settings-reason" value={reason} maxLength={500} aria-describedby="cc-settings-help" onChange={(e) => setReason(e.target.value)} />
        <p id="cc-settings-help" className="text-xs text-neutral-500">อย่างน้อย 5 ตัวอักษร บันทึกพร้อมชื่อผู้แก้ไขและค่าก่อน/หลังเปลี่ยน</p>
        {error && <p role="alert" className="break-words text-sm font-medium">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button disabled={!dirty || invalidWeeks || overlaps || reason.trim().length < 5 || save.isPending} onClick={() => { setError(""); setConfirming(true); }}>ตรวจสอบก่อนบันทึก</Button>
          <Button variant="outline" disabled={save.isPending} onClick={() => { setWindows(initial.windows); setCourses(initial.courses); setReason(""); setError(""); reload(); }}>ยกเลิกการแก้ไขและโหลดใหม่</Button>
        </div>
      </Card>
      <Card className="flex flex-col gap-3 p-4 sm:p-6">
        <h3 className="font-medium">ประวัติการตั้งค่าล่าสุด</h3>
        {initial.history.length ? initial.history.map((event) => <div key={event.id} className="border-t pt-3 text-sm">
          <p>{fmtDateTime(event.createdAt)} · {event.actorName}</p><p className="break-words text-neutral-600">{event.reason}</p>
        </div>) : <p className="text-sm text-neutral-500">ยังไม่มีการแก้ไขผ่านหน้าตั้งค่า</p>}
      </Card>

      <Dialog open={confirming} onOpenChange={(open) => { if (!save.isPending) setConfirming(open); }}>
        <DialogContent busy={save.isPending} className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto">
          <DialogHeader><DialogTitle>ยืนยันเปลี่ยนการตั้งค่า</DialogTitle><DialogDescription>มีผลกับการยื่นคำร้องใหม่ทันทีหลังบันทึกใน {initial.term.label}</DialogDescription></DialogHeader>
          <div className="flex flex-col gap-2 text-sm">
            <p className="font-medium">ช่วงเวลาหลังบันทึก</p>
            {windows.length ? windows.map((w, i) => <p key={i}>{TYPE_LABEL[w.requestType]} สัปดาห์ {w.weekFrom}–{w.weekTo} · Flow {FLOW_LABEL[w.flow].code}</p>) : <p className="font-medium">ปิดรับคำร้องทุกประเภท</p>}
            <p className="mt-2 font-medium">เปลี่ยนประกาศ {changedCourses.length} รายวิชา</p>
            {changedCourses.map((c) => <p key={c.courseId}>{c.courseCode} · ลด: {c.allowDrop ? "เปิด" : "ปิด"} · ถอน: {c.allowWithdraw ? "เปิด" : "ปิด"}{c.note ? ` · ${c.note}` : ""}</p>)}
            <p className="mt-2 whitespace-pre-wrap break-words">เหตุผล: {reason.trim()}</p>
          </div>
          <DialogFooter className="cc-dialog-actions">
            <Button variant="outline" disabled={save.isPending} onClick={() => setConfirming(false)}>กลับไปแก้ไข</Button>
            <Button disabled={save.isPending || invalidWeeks || overlaps} onClick={() => save.mutate({ termId: initial.term.id,
              revision: initial.revision, windows, courses: courses.map(({ courseId, allowDrop, allowWithdraw, note }) => ({ courseId, allowDrop, allowWithdraw, note })), reason: reason.trim() }, {
                onSuccess: (data) => { setWindows(data.windows); setCourses(data.courses); setReason(""); setConfirming(false); toast("บันทึกการตั้งค่าแล้ว"); },
                onError: (e) => { setConfirming(false); setError(requestErrorMessage(e, "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง")); },
              })}>{save.isPending && <Spinner />}{save.isPending ? "กำลังบันทึก…" : "ยืนยันบันทึก"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
