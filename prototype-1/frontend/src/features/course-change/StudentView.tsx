import { PHASE_LABELS } from "./WorkflowPanel";
import { PortalDialogContent as DialogContent, PortalEmptyState as EmptyState, PortalErrorState as ErrorCard, SyncIndicator } from "./PortalUI";
import { ArrowRight, Check, ClipboardList, FilePlus2, RotateCcw, Save, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { requestErrorMessage } from "./requestTools";
import { hasDraftContent } from "./draft";
import { useStudentDraft } from "./useStudentDraft";
import {
  useCancelCc,
  useCcContext,
  useCcEligible,
  useCcRequest,
  useCcRequests,
  useSubmitCc,
  useRecoverCcSubmission,
  type CcRequestDetail,
  type CcContext,
  type CcWindow,
  type CcEligibleCourse,
  type CcType,
  type CcStatus,
} from "@/api/courseChange";
import { useToast } from "@/app/toast";
import { SkeletonRow, Spinner } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { RequestDetailBody } from "./RequestDetail";
import { RequestPagination } from "./RequestPagination";
import {
  CcStatusBadge,
  FLOW_LABEL,
  RequestTypeBar,
  Segmented,
  TYPE_LABEL,
  fmtDate,
  sectionCredits,
} from "./shared";

const MIN_REASON = 5;

export function StudentView({ ctx, userId }: { ctx: CcContext; userId: string }) {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const requestedId = params.get("request");
  const panel = params.get("view") === "tracking" || requestedId ? "tracking" : "new";
  const setPanel = (value: "new" | "tracking") => setParams((prev) => {
    const next = new URLSearchParams(prev); next.set("view", value); next.delete("request"); return next;
  }, { replace: true });
  const overview = useCcRequests({ pageSize: 1 });
  const [courseSearch, setCourseSearch] = useState("");
  const [formError, setFormError] = useState("");
  const draft = useStudentDraft(userId, ctx.term!.id, ctx.open.withdraw && !ctx.open.drop ? "withdraw" : "drop");
  const { type, courseId, reason } = draft.draft;
  const [discarding, setDiscarding] = useState(false);
  const [review, setReview] = useState<{ type: CcType; course: CcEligibleCourse; reason: string; window: CcWindow; termId: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [trackingId, setTrackingId] = useState<string | null>(requestedId);
  useEffect(() => { setTrackingId(requestedId); }, [requestedId]);

  const eligible = useCcEligible(type);
  const submit = useSubmitCc();
  const recover = useRecoverCcSubmission();
  const context = useCcContext();
  useEffect(() => {
    if (!draft.storageError || (!courseId && !reason)) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [courseId, reason, draft.storageError]);

  const course = eligible.data?.items.find((c) => c.courseId === courseId) ?? null;
  const win = course?.window ?? null;
  const canSubmit = !!win && !!course?.eligible && reason.trim().length >= MIN_REASON;
  const busy = checking || submit.isPending || recover.isPending;
  const onSubmitted = (request: CcRequestDetail) => {
    toast(`คำร้อง ${request.requestNo} อยู่ในระบบแล้ว`);
    setReview(null);
    draft.reset();
    setFormError("");
    setPanel("tracking");
    setTrackingId(request.id);
  };

  const openReview = async () => {
    if (!canSubmit || !course) return;
    setFormError("");
    setChecking(true);
    const [fresh, freshCourses] = await Promise.all([context.refetch(), eligible.refetch()]);
    setChecking(false);
    if (fresh.isError || !fresh.data || freshCourses.isError || !freshCourses.data) {
      setFormError("ตรวจสอบข้อมูลล่าสุดไม่สำเร็จ ข้อมูลที่กรอกยังอยู่ กรุณาลองอีกครั้ง");
      return;
    }
    const currentCourse = freshCourses.data.items.find((item) => item.courseId === course.courseId);
    const current = currentCourse?.window;
    if (!current || !current.isOpen || !fresh.data.term || fresh.data.term.id !== ctx.term?.id) {
      setFormError("ช่วงเวลารับคำร้องเปลี่ยนแล้ว กรุณาตรวจสอบข้อมูลล่าสุดก่อนยื่น");
      return;
    }
    if (!currentCourse?.eligible) {
      setFormError(currentCourse?.blockedReason ?? "สิทธิ์รายวิชานี้เปลี่ยนแล้ว กรุณาเลือกรายวิชาจากข้อมูลล่าสุด");
      return;
    }
    setReview({ type, course: currentCourse, reason: reason.trim(), window: current, termId: fresh.data.term.id });
  };

  const doSubmit = () => {
    if (!review) return;
    draft.setAttempted(true);
    submit.mutate(
      { clientRequestId: draft.draft.clientRequestId, requestType: review.type, courseId: review.course.courseId, reason: review.reason,
        routePreview: { termId: review.termId, flow: review.window.flow,
          opensOn: review.window.opensOn, closesOn: review.window.closesOn, scheduleId: review.window.scheduleId, scheduleRevision: review.window.scheduleRevision } },
      {
        onSuccess: ({ request }) => {
          onSubmitted(request);
        },
        onError: (e) => {
          setReview(null);
          setFormError(requestErrorMessage(e, "ยังยืนยันผลการยื่นไม่ได้ กรุณาตรวจสอบผลการยื่นครั้งก่อน ข้อมูลที่กรอกยังอยู่"));
        },
      },
    );
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200">
        <div role="group" aria-label="งานของนิสิต" className="flex gap-1">
          <button type="button" className="cc-tab flex items-center gap-2 px-4 py-3 text-sm" aria-pressed={panel === "new"} onClick={() => setPanel("new")}><FilePlus2 className="size-4" />ยื่นคำร้องใหม่</button>
          <button type="button" className="cc-tab flex items-center gap-2 px-4 py-3 text-sm" aria-pressed={panel === "tracking"} onClick={() => setPanel("tracking")}><ClipboardList className="size-4" />ติดตามคำร้อง<span className="rounded-full bg-neutral-100 px-2 text-xs">{overview.data ? Object.values(overview.data.counts).reduce((sum, count) => sum + count, 0) : "…"}</span></button>
        </div>
      </div>
      {panel === "new" ? <div className="cc-panel-enter flex min-w-0 flex-col gap-5">
      {hasDraftContent(draft.draft) && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-xs text-neutral-600">
        <div className="flex items-start gap-2"><Save className="mt-0.5 size-4 shrink-0" /><div>
          <p className="font-medium text-neutral-900" role="status">{draft.storageError ? "ยังเก็บฉบับร่างในแท็บนี้ไม่ได้" : draft.restored ? "กู้คืนฉบับร่างในแท็บนี้แล้ว" : "เก็บฉบับร่างในแท็บนี้แล้ว"}</p>
          <p className="mt-1">{draft.storageError ? "ข้อมูลยังอยู่ในหน้านี้ กรุณาตรวจสอบก่อนปิดหรือรีโหลด" : `${draft.draft.attempted ? "ยังยืนยันผลการยื่นไม่ได้" : "ยังไม่ได้ยื่นคำร้อง"} · รีโหลดแล้วกลับมากรอกต่อได้ในแท็บนี้ ไม่เกิน 24 ชั่วโมง ปิดแท็บหรือออกจากระบบจะล้างฉบับร่าง`}</p>
        </div></div>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDiscarding(true)}>ล้างฉบับร่าง</Button>
      </div>}
      {draft.draft.attempted && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-neutral-900 bg-white p-4 text-sm">
        <div><p className="font-medium">ตรวจสอบผลการยื่นครั้งก่อน</p><p className="mt-1 text-xs text-neutral-600">หากสัญญาณขาดหลังยืนยัน อาจมีคำร้องอยู่ในระบบแล้ว ตรวจสอบได้โดยไม่สร้างคำร้องใหม่</p></div>
        <Button variant="outline" disabled={busy} onClick={() => recover.mutate(draft.draft.clientRequestId, {
          onSuccess: ({ request }) => {
            if (request) { onSubmitted(request); return; }
            draft.setAttempted(false);
            setFormError("ยังไม่พบคำร้องจากการยื่นครั้งก่อน กรุณาตรวจสอบข้อมูลและช่วงเวลา แล้วยื่นอีกครั้งได้");
          },
          onError: (error) => setFormError(requestErrorMessage(error, "ตรวจสอบผลไม่สำเร็จ กรุณาลองอีกครั้ง")),
        })}>{recover.isPending ? <Spinner /> : <RotateCcw className="size-4" />}{recover.isPending ? "กำลังตรวจสอบผล…" : "ตรวจสอบผลการยื่น"}</Button>
      </div>}
      <RequestTypeBar
        toggle={
          <Segmented
            value={type}
            disabled={busy}
            onChange={(type) => { draft.update({ type, courseId: null }); setFormError(""); }}
            options={[
              { value: "drop", label: TYPE_LABEL.drop },
              { value: "withdraw", label: TYPE_LABEL.withdraw },
            ]}
          />
        }
        hint={
          win?.isOpen
            ? `${course?.scheduleLabel ?? "กำหนดรายวิชา"} · สัปดาห์ภาคการศึกษาที่ ${ctx.week}`
            : "เลือกรายวิชาเพื่อดูกำหนดและขั้นตอนของคุณ"
        }
        deadline={
          win ? (
            <>
              {win.isOpen ? "ยื่นได้ถึง " : "กำหนดปิดรับ "}<span className="font-semibold text-neutral-950">{fmtDate(win.closesOn)}</span> เวลา 23:59 น. (ไทย)
            </>
          ) : (
            "ยึดวันที่หลักสูตรประกาศรายวิชา / ตอนเรียน"
          )
        }

      />

      <div className="flex min-w-0 flex-col gap-6 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-6">
        <p className="rounded-xl border border-neutral-200 p-4 text-xs leading-relaxed text-neutral-600">กำหนดรับคำร้องอาจต่างกันตาม Block และตอนเรียน ระบบใช้วันที่หลักสูตรประกาศของวิชานั้น การยื่นทุกเส้นทางต้องผ่านเจ้าหน้าที่ตรวจคำร้องก่อน</p>
        {(
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-6">
              <section className="flex flex-col gap-3">
                <StepHeading n={1} title="เลือกรายวิชา" sub="จากรายวิชาที่ลงทะเบียนในภาคการศึกษานี้" />
                {eligible.data && eligible.data.items.length > 4 && <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-3 size-4 text-neutral-400" />
                  <Input aria-label="ค้นหารายวิชาของฉัน" placeholder="ค้นหารหัสหรือชื่อรายวิชา" value={courseSearch} onChange={(e) => setCourseSearch(e.target.value)} className="pl-9" />
                </div>}
                {eligible.isPending && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <SkeletonRow key={i} className="h-20" />
                    ))}
                  </div>
                )}
                {eligible.isError && <ErrorCard onRetry={() => void eligible.refetch()} />}
                {eligible.isSuccess && eligible.data.items.length === 0 && (
                  <EmptyState
                    title="ยังไม่พบข้อมูลรายวิชาของคุณในภาคการศึกษานี้"
                    description="หากลงทะเบียนแล้ว ลองโหลดข้อมูลอีกครั้ง หากยังไม่พบ กรุณาติดต่อเจ้าหน้าที่หลักสูตรเพื่อตรวจสอบข้อมูล การไม่พบรายวิชาในหน้านี้ยังไม่ใช่ข้อสรุปว่าคุณไม่มีสิทธิ์ลดหรือถอนรายวิชา"
                    action={<Button variant="outline" size="sm" disabled={eligible.isFetching || busy} onClick={() => void eligible.refetch()}>{eligible.isFetching ? "กำลังโหลดข้อมูล…" : "โหลดรายวิชาอีกครั้ง"}</Button>}
                  />
                )}
                {eligible.data?.items.some((c) => c.enrollmentSource === "synthetic-demo") && (
                  <p className="text-[11px] text-neutral-500">
                    ข้อมูลการลงทะเบียนเป็นข้อมูลสาธิต (สังเคราะห์) — ไม่ได้ดึงมาจาก Reg Chula
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  {eligible.data?.items.filter((c) => `${c.courseCode} ${c.courseName}`.toLocaleLowerCase().includes(courseSearch.trim().toLocaleLowerCase())).map((c) => {
                    const selected = c.courseId === courseId;
                    return (
                      <button
                        key={c.courseId}
                        type="button"
                        aria-disabled={!c.eligible || busy}
                        onClick={() => { if (c.eligible && !busy) { draft.update({ courseId: c.courseId }); setFormError(""); } }}
                        aria-pressed={selected}
                        aria-label={`${c.courseCode} ${c.courseName}${c.blockedReason ? ` — ${c.blockedReason}` : ""}`}
                        className={cn(
                          "cc-course-card flex items-start gap-3 rounded-xl border bg-white p-4 text-left",
                          selected
                            ? "border-neutral-900 ring-1 ring-neutral-900"
                            : "border-neutral-200 hover:border-neutral-400",
                          !c.eligible && "cursor-not-allowed bg-neutral-50 hover:border-neutral-200",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                            selected ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300",
                          )}
                        >
                          {selected && <Check className="size-3" />}
                        </span>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-sm font-medium">{c.courseCode}</span>
                          <span className="break-words text-xs text-neutral-600">{c.courseName}</span>
                          <span className="text-[11px] text-neutral-500">
                            {sectionCredits(c.section, c.credits)}
                          </span>
                          {c.window && <span className="mt-1 text-xs text-neutral-600">{c.scheduleLabel} · {fmtDate(c.window.opensOn)}–{fmtDate(c.window.closesOn)}</span>}
                          {c.blockedReason && (
                            <span className="mt-1 text-[11px] text-neutral-900">{c.blockedReason}</span>
                          )}
                          {c.announcement && c.announcement !== c.blockedReason && <span className="mt-1 whitespace-pre-wrap break-words border-t border-neutral-200 pt-2 text-xs leading-relaxed text-neutral-600">ประกาศหลักสูตร: {c.announcement}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {eligible.data && !eligible.data.items.some((c) => `${c.courseCode} ${c.courseName}`.toLocaleLowerCase().includes(courseSearch.trim().toLocaleLowerCase())) && eligible.data.items.length > 0 && <EmptyState title="ไม่พบรายวิชาที่ค้นหา" description="ลองใช้รหัสวิชาหรือชื่อบางส่วน" action={<Button variant="outline" size="sm" onClick={() => setCourseSearch("")}>ล้างการค้นหา</Button>} />}
                {course && <p className="flex items-center gap-2 text-xs text-neutral-700"><Check className="size-3.5" />เลือก {course.courseCode} แล้ว{courseSearch && !`${course.courseCode} ${course.courseName}`.toLocaleLowerCase().includes(courseSearch.trim().toLocaleLowerCase()) && " · อยู่นอกผลการค้นหา"}</p>}
              </section>

              <section className="flex flex-col gap-3">
                <StepHeading n={2} title="เหตุผล" sub="ใช้ประกอบการตรวจสอบคำร้องของเจ้าหน้าที่" />
                <label htmlFor="cc-reason" className="sr-only">เหตุผลคำร้อง</label>
                <Textarea
                  id="cc-reason"
                  disabled={busy}
                  aria-describedby="cc-reason-help"
                  aria-invalid={reason.length > 0 && reason.trim().length < MIN_REASON}
                  value={reason}
                  onChange={(e) => { draft.update({ reason: e.target.value }); setFormError(""); }}
                  maxLength={1000}
                  rows={4}
                  placeholder={`เหตุผลที่ต้องการ${TYPE_LABEL[type]}`}
                  className="bg-white"
                />
                <div id="cc-reason-help" className="flex flex-wrap justify-between gap-2 text-xs text-neutral-600">
                  <span>กรอกเหตุผลอย่างน้อย {MIN_REASON} ตัวอักษร (ไม่นับช่องว่างหัวท้าย)</span>
                  <span>{reason.length}/1000</span>
                </div>
              </section>
            </div>

            <section className="flex flex-col gap-3 lg:sticky lg:top-6 lg:self-start">
              <h2 className="text-sm font-semibold">หลังยื่นคำร้อง</h2>
              <Card className="flex flex-col gap-3 rounded-xl bg-neutral-50/70 p-4">
                <p className="text-sm font-medium">ยื่น → เจ้าหน้าที่ตรวจ → ดำเนินการตามรายวิชา</p>
                <p className="text-xs leading-relaxed text-neutral-600">{course?.scheduleLabel ? `${course.scheduleLabel} · ${course.courseFormat === "block" ? "Block Course" : "เต็มภาคการศึกษา"}` : "เลือกวิชาเพื่อดูกำหนดที่ประกาศ หากไม่มีประกาศให้ติดต่อเจ้าหน้าที่หลักสูตร"}</p>
                <p className="text-xs leading-relaxed text-neutral-600">หากข้อมูลไม่ครบ เจ้าหน้าที่จะส่งกลับให้แก้ไขในคำร้องเดิม การตรวจผ่านยังไม่ใช่ผลลด/ถอนจากทะเบียน</p>
              </Card>
            </section>
          </div>
        )}
      </div>

      {formError && <div role="alert" className="rounded-xl border-2 border-neutral-900 bg-white p-4 text-sm">{formError}</div>}
      {win && <div className="cc-surface flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
        <div><p className="text-sm font-medium">ตรวจสอบก่อนยื่นคำร้อง</p><p className="mt-1 text-xs text-neutral-500">{!course ? "เลือกรายวิชาที่ต้องการดำเนินการ" : reason.trim().length < MIN_REASON ? "ระบุเหตุผลอย่างน้อย 5 ตัวอักษร" : `${TYPE_LABEL[type]} · ${course.courseCode} · พร้อมตรวจสอบข้อมูล`}</p></div>
        <Button size="lg" disabled={!canSubmit || busy || draft.draft.attempted} onClick={() => void openReview()} className="w-full sm:w-auto">
          {checking ? <Spinner /> : <ArrowRight className="size-4" />}{checking ? "กำลังตรวจสอบ…" : "ตรวจสอบและยื่นคำร้อง"}
        </Button>
      </div>}
      </div> : <MyRequestsTable onTrack={setTrackingId} onNew={() => setPanel("new")} />}


      <Dialog open={!!review} onOpenChange={(open) => { if (!open && !submit.isPending) setReview(null); }}>
        <DialogContent busy={submit.isPending} className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>ยืนยันการยื่นคำร้อง{TYPE_LABEL[review?.type ?? type]}</DialogTitle>
            <DialogDescription>
              {review?.course.courseCode} {review?.course.courseName} ·{" "}
              {review ? sectionCredits(review.course.section, review.course.credits) : ""}
            </DialogDescription>
          </DialogHeader>
          {review && (
            <div className="flex flex-col gap-2 text-sm">
              <span className="self-start rounded-full border px-2 py-1 text-xs">รอเจ้าหน้าที่ตรวจคำร้อง</span>
              <p className="text-neutral-600">เจ้าหน้าที่จะตรวจคำร้องก่อนดำเนินการตาม {review.course.scheduleLabel} ไม่ส่ง Reg Chula หรือ PI อัตโนมัติหลังยื่น</p>
              {review.course.announcement && <p className="whitespace-pre-wrap break-words rounded-lg border p-3 text-xs text-neutral-600">ประกาศหลักสูตร: {review.course.announcement}</p>}
              <span className="font-medium">เหตุผลที่ยื่น</span>
              <p className="whitespace-pre-wrap break-words rounded-lg bg-neutral-50 p-3">{review.reason}</p>
              <p className="text-xs text-neutral-600">การยื่นคำร้องยังไม่ใช่ผลทะเบียนสุดท้าย ติดตามผลได้ในรายการคำร้อง</p>
            </div>
          )}
          <DialogFooter className="cc-dialog-actions">
            <Button variant="outline" disabled={submit.isPending} onClick={() => setReview(null)}>
              กลับไปแก้ไข
            </Button>
            <Button onClick={doSubmit} disabled={submit.isPending}>
              {submit.isPending && <Spinner />}
              {submit.isPending ? "กำลังส่งคำร้อง…" : "ยืนยันยื่นคำร้อง"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={discarding} onOpenChange={setDiscarding}>
        <DialogContent>
          <DialogHeader><DialogTitle>ล้างฉบับร่างนี้?</DialogTitle><DialogDescription>ล้างวิชาและเหตุผลที่กรอกในแท็บนี้ คำร้องที่ยื่นไปแล้วจะยังอยู่ในระบบ</DialogDescription></DialogHeader>
          {draft.draft.attempted && <p className="text-sm text-neutral-600">ควรตรวจสอบผลการยื่นครั้งก่อน หรือตรวจในหน้าติดตามคำร้องก่อนล้างฉบับร่าง</p>}
          <DialogFooter className="cc-dialog-actions"><Button variant="outline" onClick={() => setDiscarding(false)}>เก็บไว้ก่อน</Button><Button onClick={() => { draft.reset(); setFormError(""); setCourseSearch(""); setDiscarding(false); }}>ยืนยันล้างฉบับร่าง</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <TrackingDialog key={trackingId ?? "closed"} id={trackingId} onClose={() => { setTrackingId(null); if (requestedId) setPanel("tracking"); }} />
    </>
  );
}

function StepHeading({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-semibold text-neutral-50">
        {n}
      </span>
      <div className="flex flex-col">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs text-neutral-500">{sub}</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ my requests table

function MyRequestsTable({ onTrack, onNew }: { onTrack: (id: string) => void; onNew: () => void }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<CcStatus | "all" | "done">("all");
  const list = useCcRequests({ page, pageSize: 10, search: query, status: status === "all" ? undefined : status });
  const items = list.data?.items ?? [];
  useEffect(() => {
    if (list.data && page > list.data.pagination.totalPages) setPage(list.data.pagination.totalPages);
  }, [list.data, page]);

  return (
    <Card className="flex min-w-0 flex-col overflow-hidden">
      <div className="flex flex-col gap-3 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">คำร้องของฉัน</h2><p className="text-xs text-neutral-500">เลือกคำร้องเพื่อดูผู้รับผิดชอบและขั้นตอนถัดไป</p></div><Button variant="outline" size="sm" onClick={onNew}><FilePlus2 className="size-4" />ยื่นคำร้องใหม่</Button></div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="กรองสถานะคำร้อง">
          {([{value:"all", label:"ทั้งหมด"}, {value:"pending_approval", label:"รอพิจารณา"}, {value:"processing", label:"กำลังดำเนินการ"}, {value:"done", label:"ปิดแล้ว"}] as const).map((item) => <Button key={item.value} variant={status === item.value ? "default" : "outline"} size="sm" aria-pressed={status === item.value} onClick={() => { setStatus(item.value); setPage(1); }}>{item.label}</Button>)}
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setQuery(search.trim()); setPage(1); }}>
          <Input aria-label="ค้นหาคำร้องของฉัน" value={search} onChange={(e) => setSearch(e.target.value)} maxLength={100}
            placeholder="เลขคำร้อง รหัสวิชา หรือชื่อวิชา" className="min-w-0" />
          <Button type="submit" variant="outline">ค้นหา</Button>
        </form>
        {query && <button type="button" className="flex items-center gap-1 self-start text-xs underline underline-offset-4" onClick={() => { setQuery(""); setSearch(""); setPage(1); }}><X className="size-3" />ล้างการค้นหา “{query}”</button>}
        <SyncIndicator updatedAt={list.dataUpdatedAt} refreshing={list.isFetching} error={list.isError} onRefresh={() => void list.refetch()} />
      </div>
      {items.length > 0 && <div className="hidden grid-cols-[140px_100px_minmax(0,1fr)_150px_120px] gap-4 px-6 pb-3 text-xs text-neutral-500 lg:grid">
        <span>เลขคำร้อง</span><span>ประเภท</span><span>รายวิชา</span><span>สถานะล่าสุด</span><span className="text-right">ดำเนินการ</span>
      </div>}
      {list.isPending && Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} className="mx-4 my-2 h-20" />)}
      {list.isError && <ErrorCard onRetry={() => void list.refetch()} />}
      {list.isSuccess && items.length === 0 && <EmptyState title={query ? "ไม่พบคำร้องที่ตรงกับการค้นหา" : status === "all" ? "ยังไม่มีคำร้อง" : "ไม่มีคำร้องในสถานะนี้"} description={query ? "ลองค้นหาด้วยรหัสวิชาหรือเลขคำร้องบางส่วน" : "คำร้องที่ยื่นจะแสดงที่นี่ พร้อมสถานะและประวัติการดำเนินการ"} action={status === "all" && !query ? <Button variant="outline" onClick={onNew}>เริ่มคำร้องแรก</Button> : undefined} />}
      {items.map((r) => (
        <article key={r.id} className="grid min-w-0 gap-3 border-t border-neutral-200 p-4 text-sm sm:px-6 lg:grid-cols-[140px_100px_minmax(0,1fr)_150px_120px] lg:items-center lg:gap-4">
          <span className="break-words font-mono text-xs">{r.requestNo}</span>
          <span>{TYPE_LABEL[r.requestType]}</span>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="break-words">{r.courseCode} {r.courseName}</span>
            <span className="text-xs text-neutral-500">{r.workflowVersion === 2 ? PHASE_LABELS[r.phase ?? ""] : FLOW_LABEL[r.flow].short} · สัปดาห์ที่ {r.weekNo}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-start lg:gap-1">
            <CcStatusBadge status={r.status} />
            <span className="text-xs text-neutral-500">{fmtDate(r.updatedAt)}</span>
          </div>
          <Button size="sm" variant={r.status === "rejected" ? "default" : "outline"}
            className="w-full rounded-full lg:w-auto" onClick={() => onTrack(r.id)}>
            {r.status === "rejected" ? "ดูเหตุผล" : "ติดตามสถานะ"}
          </Button>
        </article>
      ))}
      {list.data && <RequestPagination pagination={list.data.pagination} onChange={setPage} />}
    </Card>
  );
}

// -------------------------------------------------------------- tracking dialog

function TrackingDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const toast = useToast();
  const detail = useCcRequest(id);
  const cancel = useCancelCc();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const r = detail.data?.request;

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && !cancel.isPending && onClose()}>
      <DialogContent busy={cancel.isPending} className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>ติดตามคำร้อง</DialogTitle>
          <DialogDescription>อัปเดตทุก 30 วินาที · ดูความคืบหน้าและประวัติคำร้อง</DialogDescription>
        </DialogHeader>
        {detail.isPending && <SkeletonRow className="h-48" />}
        {detail.isError && <ErrorCard onRetry={() => void detail.refetch()} />}
        {r && <RequestDetailBody r={r} />}
        {confirmCancel && r?.status === "pending_approval" && (
          <p role="alert" className="rounded-lg border-2 border-neutral-900 p-3 text-sm">
            ยืนยันยกเลิก {r.requestNo} ใช่ไหม? คำร้องนี้จะหยุดดำเนินการ หากต้องการยื่นใหม่ระบบจะตรวจสิทธิ์และช่วงเวลาอีกครั้ง
          </p>
        )}
        <DialogFooter className="cc-dialog-actions">
          <Button variant="outline" disabled={cancel.isPending} onClick={() => confirmCancel ? setConfirmCancel(false) : onClose()}>
            {confirmCancel ? "กลับ" : "ปิด"}
          </Button>
          {r?.status === "pending_approval" && (
            <Button variant={confirmCancel ? "default" : "outline"} disabled={cancel.isPending}
              onClick={() => {
                if (!confirmCancel) { setConfirmCancel(true); return; }
                cancel.mutate(r.id, {
                  onSuccess: () => { setConfirmCancel(false); toast(`ยกเลิกคำร้อง ${r.requestNo} แล้ว`); },
                  onError: (e) => { setConfirmCancel(false); toast(requestErrorMessage(e, "ยกเลิกไม่สำเร็จ กรุณาลองอีกครั้ง")); },
                });
              }}>
              {cancel.isPending && <Spinner />}
              {cancel.isPending ? "กำลังยกเลิก…" : confirmCancel ? "ยืนยันยกเลิกคำร้อง" : "ยกเลิกคำร้อง"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
