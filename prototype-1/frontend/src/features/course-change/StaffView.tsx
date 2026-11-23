import { canCollectSignatures, SignatureBatchDialog, SignatureBatchHistory } from "./SignatureBatches";
import { PhaseWait } from "./PhaseWait";
import { PHASE_LABELS } from "./WorkflowPanel";
import { PortalDialogContent as DialogContent, PortalEmptyState as EmptyState, PortalErrorState as ErrorCard, SyncIndicator } from "./PortalUI";
import { formatDistanceToNow, parseISO } from "date-fns";
import { th } from "date-fns/locale";
import { Download, Inbox, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { requestsCsv, requestErrorMessage } from "./requestTools";
import {
  useApproveCc,
  useBulkReviewCc,
  useCcRequest,
  useCcGroups,
  type CcRequestGroup,
  useCcRequests,
  useCompleteCc,
  useRejectCc,
  type CcContext,
  type CcRequest,
  type CcStatus,
  type CcType,
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
import { Input } from "@/components/ui/input";
import { RequestPagination } from "./RequestPagination";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { RequestDetailBody } from "./RequestDetail";
import {
  CcStatusBadge,
  FLOW_LABEL,
  FlowSwatch,
  RequestTypeBar,
  Segmented,
  TYPE_LABEL,
} from "./shared";

type Tab = "pending_approval" | "processing" | "done" | "all";

const TABS: { value: Tab; label: string; statuses: CcStatus[] | null }[] = [
  { value: "pending_approval", label: "รอตรวจ / พิจารณา", statuses: ["pending_approval"] },
  { value: "processing", label: "กำลังดำเนินการ", statuses: ["processing"] },
  { value: "done", label: "ปิดแล้ว", statuses: ["completed", "rejected", "cancelled"] },
  { value: "all", label: "ทั้งหมด", statuses: null },
];

const errMsg = requestErrorMessage;

export function StaffView({ ctx }: { ctx: CcContext }) {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const focusId = params.get("request");
  const clearFocus = () => setParams((prev) => { const next = new URLSearchParams(prev); next.delete("request"); return next; }, { replace: true });
  const [group, setGroup] = useState<CcRequestGroup | null>(null);
  const [phase, setPhase] = useState("");
  const [section, setSection] = useState("");
  const [type, setType] = useState<CcType | "all">("all");
  const [tab, setTab] = useState<Tab>("pending_approval");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [signatureRows, setSignatureRows] = useState<CcRequest[] | null>(null);
  const [review, setReview] = useState<CcRequest[] | null>(null);
  const [bulkError, setBulkError] = useState("");
  const [failures, setFailures] = useState<{ requestNo: string; message: string }[]>([]);
  const detailPanel = useRef<HTMLDivElement>(null);
  const groups = useCcGroups({ phase: phase || undefined, section: section.trim() || undefined, type: type === "all" ? undefined : type, status: tab === "all" ? undefined : tab, search: query });
  const list = useCcRequests({ phase: phase || undefined, section: section.trim() || undefined, courseId: group?.courseId, termId: group?.termId, type: type === "all" ? undefined : type,
    status: tab === "all" ? undefined : tab, page, pageSize: 25, search: query });
  const bulk = useBulkReviewCc();

  const items = list.data?.items ?? [];
  const countFor = (t: (typeof TABS)[number]) => {
    if (!list.data) return "…";
    const counts = list.data.counts;
    return t.statuses ? t.statuses.reduce((sum, status) => sum + (counts[status] ?? 0), 0)
      : Object.values(counts).reduce((sum, n) => sum + n, 0);
  };
  const resetSelection = () => { setChecked(new Set()); setReview(null); setBulkError(""); setFailures([]); if (focusId) clearFocus(); };
  useEffect(() => {
    if (list.data && page > list.data.pagination.totalPages) setPage(list.data.pagination.totalPages);
  }, [list.data, page]);

  // Keep a sensible selection: the first row of the current list, unless the user picked one.
  useEffect(() => {
    if (!items.some((r) => r.id === selectedId)) setSelectedId(items[0]?.id ?? null);
  }, [items, selectedId]);

  // Checked rows only make sense while pending and visible.
  const pendingIds = new Set(items.filter((r) => ["pending_approval", "processing"].includes(r.status) && r.workflowVersion === 2).map((r) => r.id));
  const checkedIds = [...checked].filter((id) => pendingIds.has(id));

  const toggle = (id: string) =>
    setChecked((prev) => {
      const nextSet = new Set(prev);
      if (nextSet.has(id)) nextSet.delete(id);
      else if (nextSet.size < 50) nextSet.add(id);
      return nextSet;
    });

  const approveChecked = () =>
    bulk.mutate((review ?? []).map((r) => ({ id: r.id, revision: r.revision ?? 0 })), {
      onSuccess: ({ results }) => {
        const ok = results.filter((r) => r.ok).length;
        const failed = results.length - ok;
        toast(`ตรวจผ่านแล้ว ${ok} รายการ${failed ? ` · ไม่สำเร็จ ${failed}` : ""}`);
        const failedResults = results.filter((r) => !r.ok);
        setFailures(failedResults.map((result) => ({
          requestNo: review?.find((r) => r.id === result.id)?.requestNo ?? result.id,
          message: result.message ?? "บันทึกไม่สำเร็จ กรุณาลองใหม่",
        })));
        setChecked(new Set(failedResults.map((r) => r.id)));
        setReview(null);
      },
      onError: (e) => setBulkError(errMsg(e, "ตรวจผ่านไม่สำเร็จ กรุณาลองอีกครั้ง")),
    });

  const pendingCount = list.data ? list.data.counts.pending_approval ?? 0 : "…";
  const selectedRequests = items.filter((r) => checkedIds.includes(r.id));
  const exportSelected = () => {
    const url = URL.createObjectURL(new Blob([requestsCsv(selectedRequests)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `course-change-summary-${ctx.today}.csv`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`ส่งออกสรุป ${selectedRequests.length} รายการแล้ว`);
  };

  return (
    <>
      <label className="flex max-w-md flex-col gap-1 text-xs">กรองงานตามขั้นตอน
        <select className="h-10 rounded-md border bg-white px-2 text-sm" value={phase} onChange={e=>{setPhase(e.target.value);setTab("all");setPage(1);resetSelection();}}>
          <option value="">ทุกขั้นตอน</option>{Object.entries(PHASE_LABELS).filter(([key])=>key!=="completed").map(([key,label])=><option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      <label className="flex max-w-md flex-col gap-1 text-xs">กรองตอนเรียน (เว้นว่างเพื่อดูทั้งหมด)<Input value={section} maxLength={30} placeholder="เช่น 101" onChange={e=>{setSection(e.target.value);setPage(1);resetSelection();}} /></label>
      <SignatureBatchHistory />
      <RequestTypeBar
        toggle={
          <Segmented
            value={type}
            onChange={(value) => { setType(value); setGroup(null); setPage(1); resetSelection(); }}
            options={[
              { value: "all", label: "ทั้งหมด" },
              { value: "drop", label: TYPE_LABEL.drop },
              { value: "withdraw", label: TYPE_LABEL.withdraw },
            ]}
          />
        }
        hint="ตรวจสอบข้อมูลก่อนพิจารณา · ผลอนุมัติยังไม่ใช่ผลทะเบียนสุดท้าย"
        deadline={
          <>
            รอพิจารณา <span className="font-semibold text-neutral-950">{pendingCount}</span> รายการ
          </>
        }
        action={
          <Button disabled={checkedIds.length === 0 || bulk.isPending || selectedRequests.some(r => r.phase !== "staff_review")} onClick={() => { setBulkError(""); setReview(selectedRequests); }}>
            {bulk.isPending && <Spinner />}
            ตรวจผ่านที่เลือก{checkedIds.length > 0 ? ` (${checkedIds.length})` : ""}
          </Button>
        }
      />

      {focusId && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white p-3 text-sm"><span>กำลังเปิดคำร้องจากการแจ้งเตือน</span><Button variant="ghost" size="sm" onClick={clearFocus}>กลับรายการ</Button></div>}
      {failures.length > 0 && (
        <div role="alert" className="rounded-lg border-2 border-neutral-900 p-4 text-sm">
          <p className="font-medium">รายการที่ตรวจผ่านไม่สำเร็จ</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {failures.map((failure) => <li key={failure.requestNo}>{failure.requestNo}: {failure.message}</li>)}
          </ul>
        </div>
      )}
      <div className="cc-surface flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4">
        <div className="grid gap-3 lg:grid-cols-2">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setQuery(search.trim()); setGroup(null); setPage(1); resetSelection(); }}>
            <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-neutral-400" /><Input aria-label="ค้นหาคำร้อง" placeholder="เลขคำร้อง รหัสนิสิต ชื่อ หรือรายวิชา" value={search} maxLength={100}
              onChange={(e) => setSearch(e.target.value)} className="min-w-0 pl-9" /></div>
            <Button type="submit" variant="outline">ค้นหา</Button>
          </form>
          <label className="flex min-w-0 flex-col gap-1 text-xs text-neutral-600">
            <span className="sr-only">รวบรวมตามรายวิชาและเทอม</span>
            <select aria-label="รวบรวมตามรายวิชาและเทอม" className="h-9 min-w-0 rounded-md border bg-white px-3 text-sm" value={group ? `${group.termId}:${group.courseId}` : ""}
              onChange={(e) => { setGroup(groups.data?.items.find((item) => `${item.termId}:${item.courseId}` === e.target.value) ?? null); setPage(1); resetSelection(); }}>
              <option value="">ทุกรายวิชา / ทุกภาคการศึกษา</option>
              {group && !groups.data?.items.some((item) => item.courseId === group.courseId && item.termId === group.termId) && <option value={`${group.termId}:${group.courseId}`}>{group.courseCode} · {group.termLabel} (ไม่มีรายการในหมวดนี้)</option>}
              {groups.data?.items.map((item) => <option key={`${item.termId}:${item.courseId}`} value={`${item.termId}:${item.courseId}`}>{item.courseCode} {item.courseName} · {item.termLabel} ({item.count})</option>)}
            </select>
          </label>
        </div>
        {groups.isError && <p className="text-xs text-neutral-600">โหลดรายการรายวิชาไม่สำเร็จ <button type="button" className="underline" onClick={() => void groups.refetch()}>ลองอีกครั้ง</button></p>}
        {(query || group) && <div className="flex flex-wrap gap-2 text-xs">
          {query && <button type="button" className="flex items-center gap-1 rounded-full border px-3 py-1" onClick={() => { setQuery(""); setSearch(""); setPage(1); resetSelection(); }}>ค้นหา: {query}<X className="size-3" /></button>}
          {group && <button type="button" className="flex items-center gap-1 rounded-full border px-3 py-1" onClick={() => { setGroup(null); setPage(1); resetSelection(); }}>{group.courseCode} · {group.termLabel}<X className="size-3" /></button>}
        </div>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SyncIndicator updatedAt={list.dataUpdatedAt} refreshing={list.isFetching} error={list.isError} onRefresh={() => { void list.refetch(); void groups.refetch(); }} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" disabled={!pendingIds.size || bulk.isPending} onClick={() => setChecked(new Set([...pendingIds].slice(0, 50)))}>เลือกรายการในหน้านี้</Button>
            {checkedIds.length > 0 && <><Button size="sm" variant="ghost" disabled={bulk.isPending} onClick={resetSelection}>ล้างที่เลือก ({checkedIds.length})</Button><Button size="sm" variant="outline" disabled={bulk.isPending} onClick={exportSelected}><Download className="size-3.5" />ส่งออกสรุปที่เลือก</Button></>}
          </div>
        </div>
        {checkedIds.length > 0 && <Button variant="outline" disabled={!canCollectSignatures(selectedRequests)} onClick={()=>setSignatureRows(selectedRequests)}>บันทึกส่งขอลงนามเป็นชุด ({checkedIds.length})</Button>}
        {checkedIds.length > 0 && !canCollectSignatures(selectedRequests) && <p className="text-xs text-neutral-500">การรวบรวมขอลงนามต้องเป็นงานรอลงนามของวิชา ตอนเรียน ประเภท และรอบเดียวกัน</p>}
        {checkedIds.length > 0 && <p className="text-xs text-neutral-500">ไฟล์สรุปใช้ช่วยตรวจงาน ยังไม่ใช่เอกสารคำร้องทางการ · การเลือกจะถูกล้างเมื่อเปลี่ยนตัวกรองหรือหน้า</p>}
      </div>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* ------------------------------------------------ list of contents */}
        <Card className="cc-surface flex min-w-0 flex-col overflow-hidden rounded-2xl lg:sticky lg:top-4 lg:min-h-[360px] lg:self-start">
          <div className="flex gap-1 overflow-x-auto border-b border-neutral-200 p-2">
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => { setTab(t.value); setGroup(null); setPage(1); resetSelection(); }}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors",
                  tab === t.value
                    ? "bg-neutral-900 text-neutral-50"
                    : "text-neutral-600 hover:bg-neutral-100",
                )}
              >
                {t.label}
                <span className="text-xs opacity-70">{countFor(t)}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {list.isPending && (
              <div className="flex flex-col gap-3 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonRow key={i} className="h-14" />
                ))}
              </div>
            )}
            {list.isError && (
              <div className="p-4">
                <ErrorCard onRetry={() => void list.refetch()} />
              </div>
            )}
            {list.isSuccess && items.length === 0 && <EmptyState title="ไม่มีคำร้องในหมวดนี้" description={query || group ? "ลองล้างตัวกรอง หรือเลือกสถานะอื่นเพื่อดูรายการ" : "คำร้องใหม่จะแสดงที่นี่เมื่อมีนิสิตยื่นเรื่อง"} />}

            {items.map((r) => (
              <InboxRow
                key={r.id}
                r={r}
                selected={r.id === (focusId ?? selectedId)}
                checked={checkedIds.includes(r.id)}
                selectionDisabled={bulk.isPending || (checkedIds.length >= 50 && !checkedIds.includes(r.id))}
                onSelect={() => {
                  if (focusId) clearFocus();
                  setSelectedId(r.id);
                  if (window.matchMedia("(max-width: 1023px)").matches) detailPanel.current?.scrollIntoView({
                    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start",
                  });
                }}
                onToggle={() => toggle(r.id)}
              />
            ))}
          </div>
          {list.data && <RequestPagination pagination={list.data.pagination} onChange={(next) => { setPage(next); resetSelection(); }} />}
        </Card>

        {/* -------------------------------------------- selected content */}
        <Card ref={detailPanel} className="cc-surface min-w-0 scroll-mt-4 rounded-2xl p-4 sm:p-6 lg:min-h-[480px]">
          {focusId || selectedId ? (
            <SelectedRequest key={focusId ?? selectedId} id={(focusId ?? selectedId)!} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-neutral-500">
              <Inbox className="size-6" />
              <p className="text-sm">เลือกคำร้องจากรายการทางซ้าย</p>
            </div>
          )}
        </Card>
      </div>
      {signatureRows && <SignatureBatchDialog rows={signatureRows} today={ctx.today} onClose={()=>{setSignatureRows(null);setChecked(new Set());}} />}
      <Dialog open={!!review} onOpenChange={(open) => { if (!open && !bulk.isPending) setReview(null); }}>
        <DialogContent busy={bulk.isPending} className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>ยืนยันตรวจผ่าน {review?.length ?? 0} รายการ</DialogTitle>
            <DialogDescription>ตรวจสอบเลขคำร้องก่อนยืนยัน การตรวจผ่านไม่ใช่การลงนามหรือผลทะเบียน และไม่ส่ง Reg Chula/PI อัตโนมัติ</DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-3 text-sm">
            {review?.map((r) => <li key={r.id} className="rounded-lg border p-3">
              <p className="font-mono text-xs">{r.requestNo}</p>
              <p className="break-words">{r.studentName} · {TYPE_LABEL[r.requestType]} · {r.courseCode} {r.courseName} · ตอน {r.section ?? "ยังไม่ทราบ"}</p>
              <p className="mt-1 text-xs text-neutral-500">{r.workflowPlan?.needsSignature ? "ขั้นถัดไป: รวบรวมและรอเอกสารลงนาม" : r.workflowPlan?.registrar ? "ขั้นถัดไป: หลักสูตรรวบรวมส่ง สนท." : "ขั้นถัดไป: ให้นิสิตทำงานภายนอกตามประกาศ"}</p>
            </li>)}
          </ul>
          {bulkError && <p role="alert" className="rounded-lg border-2 border-neutral-900 p-3 text-sm">{bulkError}</p>}
          <DialogFooter className="cc-dialog-actions">
            <Button variant="outline" disabled={bulk.isPending} onClick={() => setReview(null)}>กลับไปตรวจสอบ</Button>
            <Button disabled={bulk.isPending || !review?.length} onClick={approveChecked}>
              {bulk.isPending && <Spinner />}{bulk.isPending ? "กำลังบันทึก…" : "ยืนยันตรวจผ่านที่เลือก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function InboxRow({
  r,
  selected,
  checked,
  selectionDisabled,
  onSelect,
  onToggle,
}: {
  r: CcRequest;
  selected: boolean;
  checked: boolean;
  selectionDisabled: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  const pending = ["pending_approval", "processing"].includes(r.status) && r.workflowVersion === 2;
  return (
    <div
      className={cn(
        "flex items-start gap-3 border-b border-neutral-200 px-4 py-3 transition-colors",
        selected ? "bg-neutral-100 shadow-[inset_3px_0_0_#171717]" : "hover:bg-neutral-50",
      )}
    >
      <input
        type="checkbox"
        aria-label={`เลือก ${r.requestNo}`}
        checked={checked}
        disabled={!pending || selectionDisabled}
        onChange={onToggle}
        className="mt-1 size-4 accent-neutral-900 disabled:opacity-30"
      />
      <button type="button" aria-pressed={selected} onClick={onSelect} className="flex min-w-0 flex-1 flex-col gap-1 text-left">
        <span className="flex flex-wrap items-center justify-between gap-1">
          <span className="truncate text-sm font-medium">{r.studentName}</span>
          <span className="shrink-0 text-[11px] text-neutral-500">
            {formatDistanceToNow(parseISO(r.createdAt), { addSuffix: true, locale: th })}
          </span>
        </span>
        <span className="truncate text-xs text-neutral-600">
          {TYPE_LABEL[r.requestType]} · {r.courseCode} {r.courseName}
        </span>
        <span className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
          <span className="font-mono">{r.requestNo}</span>
          {r.workflowVersion !== 2 && <span className="inline-flex items-center gap-1">
            <FlowSwatch flow={r.flow} className="size-2" />
            {FLOW_LABEL[r.flow].short}
          </span>}
          {r.workflowVersion === 2 && r.phase && <span>{PHASE_LABELS[r.phase]}</span>}
          <PhaseWait r={r} />
          {!pending && <CcStatusBadge status={r.status} />}
        </span>
      </button>
    </div>
  );
}

function SelectedRequest({ id }: { id: string }) {
  const toast = useToast();
  const detail = useCcRequest(id);
  const approve = useApproveCc();
  const reject = useRejectCc();
  const complete = useCompleteCc();

  const [actionError, setActionError] = useState("");
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [completing, setCompleting] = useState(false);
  const [note, setNote] = useState("");

  const r = detail.data?.request;
  if (detail.isPending) return <SkeletonRow className="h-64" />;
  if (detail.isError || !r) return <ErrorCard onRetry={() => void detail.refetch()} />;

  const busy = approve.isPending || reject.isPending || complete.isPending;

  return (
    <div className="flex flex-col gap-6">
      <RequestDetailBody r={r} showStudent />
      {actionError && <p role="alert" className="rounded-xl border-2 border-neutral-900 p-3 text-sm">{actionError}</p>}

      {r.workflowVersion !== 2 && (r.status === "pending_approval" || r.status === "processing") && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-neutral-200 pt-4">
          {r.status === "pending_approval" && (
            <>
              <span className="mr-auto text-xs text-neutral-500">
                {r.flow === "advisor_pi"
                  ? "อนุมัติแล้วจะสร้างเอกสารตัวอย่าง และจำลองส่ง Reg Chula / PI"
                  : "อนุมัติแล้วจะบันทึกขั้นตอนส่งต่อ สนท. แบบจำลอง"}
              </span>
              <Button variant="outline" disabled={busy} onClick={() => { setActionError(""); setRejecting(true); }}>
                ไม่อนุมัติ
              </Button>
              <Button disabled={busy} onClick={() => { setActionError(""); setApproving(true); }}>อนุมัติ</Button>
            </>
          )}
          {r.status === "processing" && (
            <>
              <span className="mr-auto text-xs text-neutral-500">
                ระบบสาธิต: เจ้าหน้าที่บันทึกผลสำเร็จแทนการรับผลจากทะเบียน
              </span>
              <Button disabled={busy} onClick={() => { setActionError(""); setCompleting(true); }}>
                บันทึกผลจากทะเบียน
              </Button>
            </>
          )}
        </div>
      )}

      <Dialog open={approving} onOpenChange={(open) => { if (!busy) setApproving(open); }}>
        <DialogContent busy={busy} className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>ยืนยันอนุมัติ {r.requestNo}</DialogTitle>
            <DialogDescription>{r.studentName} · {TYPE_LABEL[r.requestType]} · {r.courseCode} {r.courseName}</DialogDescription>
          </DialogHeader>
          <p className="text-sm">{r.flow === "advisor_pi" ? "ระบบจะสร้างเอกสารตัวอย่างและจำลองส่ง Reg Chula / PI" : "ระบบจะบันทึกขั้นตอนส่งต่อ สนท. แบบจำลอง"}</p>
          {actionError && <p role="alert" className="rounded-lg border p-3 text-sm">{actionError}</p>}
          <DialogFooter className="cc-dialog-actions">
            <Button variant="outline" disabled={busy} onClick={() => setApproving(false)}>กลับ</Button>
            <Button disabled={busy || r.status !== "pending_approval"} onClick={() => approve.mutate(r.id, {
              onSuccess: () => { setApproving(false); toast(`อนุมัติ ${r.requestNo} แล้ว`); },
              onError: (e) => { setApproving(false); setActionError(errMsg(e, "อนุมัติไม่สำเร็จ กรุณาลองอีกครั้ง")); },
            })}>{approve.isPending && <Spinner />}{approve.isPending ? "กำลังอนุมัติ…" : "ยืนยันอนุมัติ"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejecting} onOpenChange={(open) => { if (!busy) setRejecting(open); }}>
        <DialogContent busy={busy} className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>ไม่อนุมัติ {r.requestNo}</DialogTitle>
            <DialogDescription>นิสิตจะเห็นเหตุผลนี้ การยื่นใหม่ขึ้นอยู่กับช่วงเวลาและสิทธิ์รายวิชา</DialogDescription>
          </DialogHeader>
          <label htmlFor="cc-reject-reason" className="sr-only">เหตุผลที่ไม่อนุมัติ</label>
          <Textarea
            id="cc-reject-reason"
            autoFocus
            rows={3}
            maxLength={500}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="เหตุผลที่ไม่อนุมัติ"
          />
          {actionError && <p role="alert" className="rounded-lg border p-3 text-sm">{actionError}</p>}
          <DialogFooter className="cc-dialog-actions">
            <Button variant="outline" onClick={() => setRejecting(false)}>
              ยกเลิก
            </Button>
            <Button
              disabled={!rejectReason.trim() || reject.isPending}
              onClick={() =>
                reject.mutate(
                  { id: r.id, reason: rejectReason.trim() },
                  {
                    onSuccess: () => {
                      toast(`ไม่อนุมัติ ${r.requestNo}`);
                      setRejecting(false);
                      setRejectReason("");
                    },
                    onError: (e) => setActionError(errMsg(e, "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง")),
                  },
                )
              }
            >
              {reject.isPending && <Spinner />}
              {reject.isPending ? "กำลังบันทึก…" : "ยืนยันไม่อนุมัติ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={completing} onOpenChange={(open) => { if (!busy) setCompleting(open); }}>
        <DialogContent busy={busy} className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>บันทึกผลจากทะเบียน</DialogTitle>
            <DialogDescription>
              {r.requestNo} จะเปลี่ยนเป็น "ดำเนินการสำเร็จ" และแจ้งนิสิตทันที
            </DialogDescription>
          </DialogHeader>
          <label htmlFor="cc-complete-note" className="sr-only">หมายเหตุผลทะเบียน</label>
          <Textarea
            id="cc-complete-note"
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="หมายเหตุ (ไม่บังคับ) เช่น เลขอ้างอิงจาก สนท."
          />
          {actionError && <p role="alert" className="rounded-lg border p-3 text-sm">{actionError}</p>}
          <DialogFooter className="cc-dialog-actions">
            <Button variant="outline" onClick={() => setCompleting(false)}>
              ยกเลิก
            </Button>
            <Button
              disabled={complete.isPending}
              onClick={() =>
                complete.mutate(
                  { id: r.id, note: note.trim() || undefined },
                  {
                    onSuccess: () => {
                      toast(`${r.requestNo} ดำเนินการสำเร็จ`);
                      setCompleting(false);
                      setNote("");
                    },
                    onError: (e) => setActionError(errMsg(e, "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง")),
                  },
                )
              }
            >
              {complete.isPending && <Spinner />}
              {complete.isPending ? "กำลังบันทึก…" : "ยืนยันผลสำเร็จ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
