import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, post } from "./client";
import { qk } from "./queryKeys";

// Course Change API — docs/course-change/DESIGN.md §8.

export type CcType = "drop" | "withdraw";
export type CcFlow = "reg_direct" | "advisor_pi" | "program_registrar";
export type CcStatus = "pending_approval" | "processing" | "completed" | "rejected" | "cancelled";
export type CcStepState = "done" | "current" | "halted" | "upcoming";

export interface CcWindow {
  requestType: CcType;
  flow: CcFlow;
  weekFrom: number;
  weekTo: number;
  opensOn: string;
  closesOn: string;
  isOpen: boolean;
  scheduleId?: string; scheduleRevision?: number;
}

export interface CcContext {
  today: string;
  simulated: boolean;
  term: { id: string; label: string; startDate: string; endDate: string } | null;
  week: number;
  maxWeek: number;
  windows: CcWindow[];
  open: Record<CcType, CcWindow | null>;
  next: Record<CcType, CcWindow | null>;
  flowSteps: Record<CcFlow, { key: string; label: string }[]>;
}

export interface CcEligibleCourse {
  courseId: string;
  courseCode: string;
  courseName: string;
  section: string | null;
  credits: number | null;
  /** "synthetic-demo" for seeded demo enrollments — not data from Reg Chula. */
  window: CcWindow | null; scheduleLabel: string | null; courseFormat: string | null;
  enrollmentSource: string | null;
  eligible: boolean;
  blockedReason: string | null;
  announcement: string | null;
}

export interface CcRequest {
  id: string;
  requestNo: string;
  requestType: CcType;
  flow: CcFlow;
  weekNo: number;
  phaseSince?: string | null; waitingOn?: string | null;
  workflowVersion?: number; phase?: string | null; workflowPlan?: CcPlan | null; revision?: number;
  status: CcStatus;
  reason: string;
  rejectReason: string | null;
  studentId: string;
  studentName: string;
  studentNo: string;
  advisorName: string | null;
  courseId: string;
  courseCode: string;
  courseName: string;
  section: string | null;
  credits: number | null;
  termLabel: string;
  decidedByName: string | null;
  decidedAt: string | null;
  hasDocument: boolean;
  documentHash: string | null;
  regChulaRef: string | null;
  piRef: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CcStep {
  key: string;
  label: string;
  state: CcStepState;
  at: string | null;
}

export interface CcEvent {
  id: string;
  eventType: string;
  actorName: string;
  note: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface CcRequestDetail extends CcRequest {
  steps: CcStep[];
  events: CcEvent[];
  files?: CcFile[];
}

export interface CcListResponse {
  items: CcRequest[];
  counts: Partial<Record<CcStatus, number>>;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface CcListParams {
  phase?: string;
  section?: string;
  type?: CcType;
  status?: CcStatus | "done";
  search?: string;
  page?: number;
  pageSize?: number;
  courseId?: string;
  termId?: string;
}

export interface CcRequestGroup {
  termId: string; courseId: string; termLabel: string; courseCode: string; courseName: string; count: number;
}

export function useCcGroups(params: CcListParams) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") query.set(key, String(value));
  return useQuery({ queryKey: [...qk.courseChange, "groups", params],
    queryFn: () => api<{ items: CcRequestGroup[] }>(`/course-change/request-groups?${query}`), refetchInterval: 30_000 });
}

export interface CcSettings {
  term: { id: string; label: string; startDate: string };
  revision: string;
  windows: Pick<CcWindow, "requestType" | "weekFrom" | "weekTo" | "flow">[];
  courses: { courseId: string; courseCode: string; courseName: string; isActive: boolean;
    allowDrop: boolean; allowWithdraw: boolean; note: string | null }[];
  history: { id: string; actorName: string; reason: string; createdAt: string }[];
}

export interface CcSettingsInput {
  termId: string;
  revision: string;
  reason: string;
  windows: CcSettings["windows"];
  courses: Pick<CcSettings["courses"][number], "courseId" | "allowDrop" | "allowWithdraw" | "note">[];
}

export function useCcSettings() {
  return useQuery({ queryKey: [...qk.courseChange, "settings"],
    queryFn: () => api<CcSettings>("/course-change/settings"), refetchOnWindowFocus: false });
}

export function useSaveCcSettings() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: CcSettingsInput) => post<CcSettings>("/course-change/settings", body),
    onSuccess: (data) => {
      qc.setQueryData([...qk.courseChange, "settings"], data);
      void qc.invalidateQueries({ queryKey: qk.ccContext });
      void qc.invalidateQueries({ queryKey: [...qk.courseChange, "eligible"] });
    } });
}

export const ccDocumentUrl = (id: string) => `/api/v1/course-change/requests/${id}/document`;

export function useCcContext() {
  return useQuery({
    queryKey: qk.ccContext,
    queryFn: () => api<CcContext>("/course-change/context"),
    staleTime: 60_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: "always",
  });
}

export function useCcEligible(type: CcType, enabled = true) {
  return useQuery({
    queryKey: qk.ccEligible(type),
    queryFn: () =>
      api<{ items: CcEligibleCourse[] }>(`/course-change/eligible-courses?type=${type}`),
    enabled,
    refetchInterval: 30_000,
  });
}

/** Polls so the student's tracker and the staff inbox stay live (Real-time Tracking). */
export function useCcRequests(params: CcListParams = {}) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") q.set(key, String(value));
  }
  return useQuery({
    queryKey: qk.ccList({ ...params }),
    queryFn: () => api<CcListResponse>(`/course-change/requests?${q.toString()}`),
    refetchInterval: 30_000,
  });
}

export function useCcRequest(id: string | null) {
  return useQuery({
    queryKey: qk.ccDetail(id ?? ""),
    queryFn: () => api<{ request: CcRequestDetail }>(`/course-change/requests/${id}`),
    enabled: !!id,
    refetchInterval: 30_000,
  });
}

/** Every Course Change mutation refreshes the whole feature + the bell — the dataset is tiny. */
function useCcMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.courseChange });
      void qc.invalidateQueries({ queryKey: qk.notifications });
    },
    onError: () => {
      void qc.invalidateQueries({ queryKey: qk.courseChange });
    },
  });
}

export const useSubmitCc = () =>
  useCcMutation((body: { clientRequestId?: string; requestType: CcType; courseId: string; reason: string;
    routePreview?: { termId: string; flow: CcFlow; opensOn: string; closesOn: string; scheduleId?: string; scheduleRevision?: number } }) =>
    post<{ request: CcRequestDetail }>("/course-change/requests", body),
  );

export const useRecoverCcSubmission = () =>
  useCcMutation((clientRequestId: string) => api<{ request: CcRequestDetail | null }>(`/course-change/submissions/${clientRequestId}`));

export const useCancelCc = () =>
  useCcMutation((id: string) =>
    post<{ request: CcRequestDetail }>(`/course-change/requests/${id}/cancel`),
  );

export const useApproveCc = () =>
  useCcMutation((id: string) =>
    post<{ request: CcRequestDetail }>(`/course-change/requests/${id}/approve`),
  );

export const useBulkApproveCc = () =>
  useCcMutation((ids: string[]) =>
    post<{ results: { id: string; ok: boolean; message?: string }[] }>(
      "/course-change/requests/bulk-approve",
      { ids },
    ),
  );

export const useRejectCc = () =>
  useCcMutation(({ id, reason }: { id: string; reason: string }) =>
    post<{ request: CcRequestDetail }>(`/course-change/requests/${id}/reject`, { reason }),
  );

export const useCompleteCc = () =>
  useCcMutation(({ id, note }: { id: string; note?: string }) =>
    post<{ request: CcRequestDetail }>(`/course-change/requests/${id}/complete`, { note }),
  );


export interface CcPlan { scheduleId?: string; teachingStartsOn?: string | null; teachingEndsOn?: string | null; label: string; format: string; opensOn: string; closesOn: string; finalOn: string | null;
  needsSignature: boolean; needsReg: boolean; needsPi: boolean; needsMerge: boolean; registrar: boolean; }
export interface CcFile { id: string; kind: string; filename: string; sha256: string; createdAt: string; }
export interface CcSchedule extends Omit<CcPlan, "registrar"> { id: string; termId: string; courseId: string; section: string; requestType: CcType;
  flow: CcFlow; published: boolean; revision: number; updatedAt: string; }
export const useCcSchedules = () => useQuery({ queryKey: [...qk.courseChange, "schedules"], queryFn: () => api<{items: CcSchedule[]}>("/course-change/schedules") });
export const useSaveCcSchedule = () => useCcMutation((body: Omit<CcSchedule, "id" | "updatedAt" | "registrar"> & {id?: string; reason: string}) => post("/course-change/schedules", body));
export const useCcWorkflow = () => useCcMutation(({id, ...body}: {id: string; revision: number; action: string; note?: string; reason?: string}) => post<{request: CcRequestDetail}>(`/course-change/requests/${id}/workflow`, body));
export const useCcMerge = () => useCcMutation(({id, ...body}: {id: string; revision: number; ids: string[]}) => post<{request: CcRequestDetail}>(`/course-change/requests/${id}/merge`, body));
export const ccFileUrl = (id: string, fileId: string) => `/api/v1/course-change/requests/${id}/files/${fileId}`;
export const useCcUpload = () => useCcMutation(async ({id, revision, kind, file}: {id: string; revision: number; kind: string; file: File}) => {
  const body = new FormData(); body.append("file", file);
  const res = await fetch(`/api/v1/course-change/requests/${id}/files?revision=${revision}&kind=${encodeURIComponent(kind)}`, {method:"POST",credentials:"include",headers:{"X-Requested-With":"XMLHttpRequest"},body});
  const data = await res.json();
  if (!res.ok) { const error = new Error(data.error?.message ?? "แนบไฟล์ไม่สำเร็จ"); Object.assign(error, {status:res.status}); throw error; }
  return data as {request: CcRequestDetail};
});

export const useBulkReviewCc = () => useCcMutation((items: {id:string;revision:number}[]) => post<{results:{id:string;ok:boolean;message?:string}[]}>("/course-change/requests/bulk-review", {items}));

export interface CcSignatureBatch {id:string;recipient:string;sentOn:string;note:string;createdAt:string;pendingCount:number;returnedCount:number;summary:{id:string;requestNo:string;studentName:string;studentNo:string;courseCode:string;courseName:string;section:string|null;requestType:string;scheduleLabel:string;reason:string}[];}
export const useCcSignatureBatches=()=>useQuery({queryKey:[...qk.courseChange,"signature-batches"],queryFn:()=>api<{items:CcSignatureBatch[]}>("/course-change/signature-batches"),refetchInterval:30_000});
export const useCreateCcSignatureBatch=()=>useCcMutation((body:{id:string;items:{id:string;revision:number}[];recipient:string;sentOn:string;note:string})=>post<CcSignatureBatch>("/course-change/signature-batches",body));
export const useLookupCcSignatureBatch=()=>useCcMutation(async(id:string)=>{try{return await api<CcSignatureBatch>(`/course-change/signature-batches/${id}`);}catch(e){if(typeof e==='object'&&e!==null&&'status' in e&&e.status===404)return null;throw e;}});
