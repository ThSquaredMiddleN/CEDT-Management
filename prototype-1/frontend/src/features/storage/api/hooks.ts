import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { storageApi } from "./storageApi";
import type {
  IssuedLine,
  PickupDetails,
  QCSubmission,
  ReturnDecision,
} from "../types";

export const storageKeys = {
  all: ["storage"] as const,
  inventory: ["storage", "inventory"] as const,
  borrow: ["storage", "borrow"] as const,
  borrowOne: (id: string) => ["storage", "borrow", id] as const,
  pendingReturns: (studentId: string) => ["storage", "returns", studentId] as const,
  qc: ["storage", "qc"] as const,
  qcOne: (id: string) => ["storage", "qc", id] as const,
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

export const useSetItemImage = () =>
  useStorageMutation((v: { id: string; imageUrl: string | undefined }) =>
    storageApi.setItemImage(v.id, v.imageUrl),
  );

export const useWalkInCheckout = () =>
  useStorageMutation((v: { studentId: string; groupId: string; lines: IssuedLine[] }) =>
    storageApi.walkInCheckout(v.studentId, v.groupId, v.lines),
  );

export const useSubmitReturn = () =>
  useStorageMutation(
    (v: { studentId: string; decisions: Record<string, ReturnDecision>; remark: string }) =>
      storageApi.submitReturn(v.studentId, v.decisions, v.remark),
  );

export const useSubmitQC = () =>
  useStorageMutation((v: { id: string; submission: QCSubmission }) =>
    storageApi.submitQC(v.id, v.submission),
  );

export const useVerifySlip = () =>
  useStorageMutation((v: { id: string; valid: boolean }) => storageApi.verifySlip(v.id, v.valid));
