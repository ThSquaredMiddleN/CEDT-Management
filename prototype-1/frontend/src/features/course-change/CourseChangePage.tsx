import { SchedulesView } from "./SchedulesView";
import "./portal.css";
import { PortalDialogContent as DialogContent, PortalErrorState as ErrorCard } from "./PortalUI";
import { FlaskConical } from "lucide-react";
import { useState } from "react";
import { useCcContext } from "@/api/courseChange";
import { useAuth } from "@/app/AuthProvider";
import { SkeletonRow } from "@/components/states";
import { fmtDate } from "./shared";
import { StaffView } from "./StaffView";
import { StudentView } from "./StudentView";
import { SettingsView } from "./SettingsView";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** /course-change — ลด / ถอนรายวิชา. One route, two views (Figma: Student / Staff). */
export function CourseChangePage() {
  const { user } = useAuth();
  const ctx = useCcContext();
  const [view, setView] = useState<"inbox" | "settings" | "schedules">("inbox");
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [leavingSettings, setLeavingSettings] = useState(false);
  const [pendingView, setPendingView] = useState<typeof view>("inbox");
  const changeView = (target: typeof view) => {
    if (target === view) return;
    if (settingsDirty) { setPendingView(target); setLeavingSettings(true); }
    else setView(target);
  };

  return (
    <main className="cc-portal min-h-[calc(100dvh-4rem)] bg-neutral-50/60 px-4 py-6 sm:px-6 lg:px-12 lg:py-8">
      <div className="mx-auto flex min-w-0 max-w-6xl flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-neutral-500">CEDT · COURSE CHANGE</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{user?.role === "student" ? "จัดการคำร้อง ลด / ถอนรายวิชา" : "ดูแลคำร้อง ลด / ถอนรายวิชา"}</h1>
          <p className="max-w-2xl text-sm text-neutral-600">{user?.role === "student" ? "ยื่นคำร้องและติดตามทุกขั้นตอนในที่เดียว" : "ตรวจสอบคำร้อง รวบรวมตามรายวิชา และติดตามงานที่รอดำเนินการ"}</p>
          {ctx.data?.term && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-neutral-500">
              {ctx.data.term.label} · วันนี้ {fmtDate(ctx.data.today)} · สัปดาห์ที่ {ctx.data.week}
              {ctx.data.simulated && (
                <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-neutral-400 px-2 py-0.5 text-[11px]">
                  <FlaskConical className="size-3" /> วันที่จำลองสำหรับเดโม
                </span>
              )}
            </p>
          )}
        </div>
        {user?.role === "staff" && ctx.data?.term && <div className="flex flex-wrap gap-2" role="group" aria-label="มุมมองเจ้าหน้าที่">
          <Button variant={view === "inbox" ? "default" : "outline"} aria-pressed={view === "inbox"} onClick={() => changeView("inbox")}>คำร้อง</Button>
          <Button variant={view === "schedules" ? "default" : "outline"} aria-pressed={view === "schedules"} onClick={() => changeView("schedules")}>กำหนดรายวิชา / Block</Button>
          <Button variant={view === "settings" ? "default" : "outline"} aria-pressed={view === "settings"} onClick={() => changeView("settings")}>สิทธิ์รายวิชา / ตารางเดิม</Button>
        </div>}
        </div>

        <details className="group rounded-xl border border-neutral-200 bg-white text-xs text-neutral-600">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-3">
            <FlaskConical className="size-4 shrink-0" />
            <span className="font-medium text-neutral-800">โหมดสาธิต</span>
            <span>ยังไม่ส่งข้อมูลไปยังทะเบียนหรือ PI จริง</span>
            <span className="ml-auto text-neutral-500 group-open:hidden">ดูรายละเอียด +</span>
          </summary>
          <p className="border-t border-neutral-100 px-4 py-3 leading-relaxed">คำร้องใหม่ผ่านเจ้าหน้าที่ตรวจ ใช้กำหนดรายวิชาที่ประกาศในระบบ และรับ/คืนไฟล์ PDF ได้จริงในเดโม การทำ Reg Chula, PI และส่ง สนท. ยังเป็นขั้นตอนภายนอกที่ผู้ใช้บันทึกหลักฐาน ระบบยังไม่เชื่อม SSO หรือรับผลทะเบียนอัตโนมัติ คำร้องเก่าบางรายการใช้เส้นทางจำลองเดิม</p>
        </details>

        {ctx.isPending && <SkeletonRow className="h-16" />}
        {ctx.isError && <ErrorCard onRetry={() => void ctx.refetch()} />}
        {ctx.data && !ctx.data.term && <ErrorCard message="ยังไม่มีภาคการศึกษาที่เปิดอยู่" />}


        {ctx.data?.term &&
          (user?.role === "student" ? <StudentView key={`${user.id}:${ctx.data.term.id}`} userId={user.id} ctx={ctx.data} /> : view === "schedules" ? <SchedulesView onDirtyChange={setSettingsDirty} /> : view === "settings" ? <SettingsView onDirtyChange={setSettingsDirty} /> : <StaffView ctx={ctx.data} />)}
        <Dialog open={leavingSettings} onOpenChange={setLeavingSettings}>
          <DialogContent className="w-[calc(100%-2rem)]">
            <DialogHeader><DialogTitle>มีการตั้งค่าที่ยังไม่บันทึก</DialogTitle><DialogDescription>กลับไปแก้ไขต่อ หรือทิ้งการแก้ไขแล้วไปหน้าที่เลือก</DialogDescription></DialogHeader>
            <DialogFooter className="cc-dialog-actions">
              <Button variant="outline" onClick={() => setLeavingSettings(false)}>แก้ไขต่อ</Button>
              <Button onClick={() => { setLeavingSettings(false); setSettingsDirty(false); setView(pendingView); }}>ทิ้งการแก้ไข</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}
