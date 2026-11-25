import { api, post } from "@/api/client";
import type {
  BorrowRequest,
  CatalogItem,
  InventoryItem,
  IssuedLine,
  NewBorrowRequest,
  NewInventoryItem,
  PendingReturnItem,
  PickupDetails,
  QCRequest,
  QCSubmission,
  ReturnCounts,
  ReturnFine,
  Student,
} from "../types";

const put = <T,>(path: string, body: unknown) => api<T>(path, { method: "PUT", body: JSON.stringify(body) });
const S = "/storage";
const id = (v: string) => encodeURIComponent(v);

/** Thin client for /api/v1/storage. Function names match the old mock, so hooks and pages barely change. */
export const storageApi = {
  // ---- Staff
  getInventory: () => api<InventoryItem[]>(`${S}/items`),
  addInventoryItem: (input: NewInventoryItem) => post<InventoryItem>(`${S}/items`, input),
  getBorrowRequests: () => api<BorrowRequest[]>(`${S}/requests`),
  getBorrowRequest: (requestId: string) => api<BorrowRequest>(`${S}/requests/${id(requestId)}`),
  /** The datetime-local value is read in the browser's time zone and sent as an ISO instant. */
  confirmBorrow: (requestId: string, lines: IssuedLine[], pickup: PickupDetails) =>
    post<{ swept: string[] }>(`${S}/requests/${id(requestId)}/issue`, {
      lines,
      pickup: { ...pickup, pickupAt: new Date(pickup.pickupAt).toISOString() },
    }),
  rejectBorrow: (requestId: string, reason: string) => post<BorrowRequest>(`${S}/requests/${id(requestId)}/reject`, { reason }),
  staffConfirmPickup: (requestId: string) => post<BorrowRequest>(`${S}/requests/${id(requestId)}/pickup`),
  setRequestDueAt: (requestId: string, at: number) => put<BorrowRequest>(`${S}/requests/${id(requestId)}/due`, { dueAt: at }),
  lookupStudent: (studentId: string) => api<Student>(`${S}/students/${id(studentId.trim())}`),
  walkInCheckout: (studentId: string, groupId: string, lines: IssuedLine[]) =>
    post<{ swept: string[]; requestId: string }>(`${S}/walk-in`, { studentId, groupId, lines }),
  getPendingReturns: (studentId: string) => api<PendingReturnItem[]>(`${S}/students/${id(studentId)}/owed`),
  submitReturn: (studentId: string, results: Record<string, ReturnCounts>, remark: string, fine?: ReturnFine) =>
    post<{ queued: number; lost: number }>(`${S}/returns`, { studentId, results, remark, fine }),
  getQCRequests: () => api<QCRequest[]>(`${S}/qc`),
  getQCRequest: (taskId: string) => api<QCRequest>(`${S}/qc/${id(taskId)}`),
  submitQC: (taskId: string, sub: QCSubmission) => post<{ status: QCRequest["status"] }>(`${S}/qc/${id(taskId)}/submit`, sub),
  verifySlip: (taskId: string, valid: boolean) => post<{ status: QCRequest["status"] }>(`${S}/qc/${id(taskId)}/verify-slip`, { valid }),
  getDefaultDueAt: async () => (await api<{ defaultDueAt: number }>(`${S}/settings`)).defaultDueAt,
  setDefaultDueAt: async (at: number) => (await put<{ defaultDueAt: number }>(`${S}/settings/default-due`, { defaultDueAt: at })).defaultDueAt,

  // ---- Student (the signed-in user)
  getCatalog: () => api<CatalogItem[]>(`${S}/catalog`),
  getCurrentStudent: () => api<Student>(`${S}/me`),
  getMyRequests: () => api<BorrowRequest[]>(`${S}/my/requests`),
  createBorrowRequest: (input: NewBorrowRequest) => post<BorrowRequest>(`${S}/my/requests`, input),
  cancelBorrow: (requestId: string) => post<BorrowRequest>(`${S}/my/requests/${id(requestId)}/cancel`),
  reopenBorrow: (requestId: string) => post<BorrowRequest>(`${S}/my/requests/${id(requestId)}/reopen`),
  confirmPickup: (requestId: string) => post<BorrowRequest>(`${S}/my/requests/${id(requestId)}/pickup`),
  getMyPendingReturns: () => api<PendingReturnItem[]>(`${S}/my/owed`),
};
