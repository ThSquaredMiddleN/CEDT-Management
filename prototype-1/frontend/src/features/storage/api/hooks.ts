import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { storageApi } from "./storageApi";
import type {
  IssuedLine,
  NewBorrowRequest,
  PickupDetails,
  QCSubmission,
  ReturnCounts,
  ReturnFine,
} from "../types";

export const storageKeys = {
  all: ["storage"] as const,
  inventory: ["storage", "inventory"] as const,
  borrow: ["storage", "borrow"] as const,
  borrowOne: (id: string) => ["storage", "borrow", id] as const,
  pendingReturns: (studentId: string) => ["storage", "returns", studentId] as const,
  qc: ["storage", "qc"] as const,
  qcOne: (id: string) => ["storage", "qc", id] as const,
  me: ["storage", "me"] as const,
  myRequests: ["storage", "my-requests"] as const,
  myReturns: ["storage", "my-returns"] as const,
  defaultDueAt: ["storage", "default-due-at"] as const,
};

export const useInventory = () =>
  useQuery({ queryKey: storageKeys.inventory, queryFn: storageApi.getInventory });

export const useBorrowRequests = () =>
  useQuery({ queryKey: storageKeys.borrow, queryFn: storageApi.getBorrowRequests });

export const useBorrowRequest = (id: string) =>
  useQuery({ queryKey: storageKeys.borrowOne(id), queryFn: () => storageApi.getBorrowRequest(id) });

export const useStudentLookup = () =>
  useMutation({ mutationFn: (studentId: string) => storageApi.lookupStudent(studentId) });

export const usePendingReturns = (studentId: string | null) =>
  useQuery({
    queryKey: storageKeys.pendingReturns(studentId ?? ""),
    queryFn: () => storageApi.getPendingReturns(studentId!),
    enabled: !!studentId,
  });

export const useQCRequests = () =>
  useQuery({ queryKey: storageKeys.qc, queryFn: storageApi.getQCRequests });

export const useQCRequest = (id: string) =>
  useQuery({ queryKey: storageKeys.qcOne(id), queryFn: () => storageApi.getQCRequest(id) });

/** Every mutation touches stock and/or task state, so refresh the whole feature. */
function useStorageMutation<TVars, TData>(fn: (vars: TVars) => Promise<TData>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: storageKeys.all }),
  });
}

export const useConfirmBorrow = () =>
  useStorageMutation(
    (v: { id: string; lines: IssuedLine[]; pickup: PickupDetails }) =>
      storageApi.confirmBorrow(v.id, v.lines, v.pickup),
  );

export const useAddInventoryItem = () => useStorageMutation(storageApi.addInventoryItem);

export const useWalkInCheckout = () =>
  useStorageMutation((v: { studentId: string; groupId: string; lines: IssuedLine[] }) =>
    storageApi.walkInCheckout(v.studentId, v.groupId, v.lines),
  );

export const useSubmitReturn = () =>
  useStorageMutation(
    (v: { studentId: string; results: Record<string, ReturnCounts>; remark: string; fine?: ReturnFine }) =>
      storageApi.submitReturn(v.studentId, v.results, v.remark, v.fine),
  );

export const useReopenBorrow = () => useStorageMutation((id: string) => storageApi.reopenBorrow(id));

export const useSubmitQC = () =>
  useStorageMutation((v: { id: string; submission: QCSubmission }) =>
    storageApi.submitQC(v.id, v.submission),
  );

export const useVerifySlip = () =>
  useStorageMutation((v: { id: string; valid: boolean }) => storageApi.verifySlip(v.id, v.valid));

export const useCurrentStudent = () =>
  useQuery({ queryKey: storageKeys.me, queryFn: storageApi.getCurrentStudent });

export const useMyRequests = () =>
  useQuery({ queryKey: storageKeys.myRequests, queryFn: storageApi.getMyRequests });

export const useMyPendingReturns = () =>
  useQuery({ queryKey: storageKeys.myReturns, queryFn: storageApi.getMyPendingReturns });

export const useDefaultDueAt = () =>
  useQuery({ queryKey: storageKeys.defaultDueAt, queryFn: storageApi.getDefaultDueAt });

export const useCreateBorrowRequest = () =>
  useStorageMutation((input: NewBorrowRequest) => storageApi.createBorrowRequest(input));

export const useCancelBorrow = () => useStorageMutation((id: string) => storageApi.cancelBorrow(id));

export const useConfirmPickup = () => useStorageMutation((id: string) => storageApi.confirmPickup(id));

export const useSetDefaultDueAt = () => useStorageMutation((at: number) => storageApi.setDefaultDueAt(at));

export const useSetRequestDueAt = () =>
  useStorageMutation((v: { id: string; at: number }) => storageApi.setRequestDueAt(v.id, v.at));

export const useCatalog = () => useQuery({ queryKey: ["storage", "catalog"] as const, queryFn: storageApi.getCatalog });

export const useRejectBorrow = () =>
  useStorageMutation((v: { id: string; reason: string }) => storageApi.rejectBorrow(v.id, v.reason));

export const useStaffConfirmPickup = () => useStorageMutation((id: string) => storageApi.staffConfirmPickup(id));
