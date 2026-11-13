export interface InventoryItem {
  id: string; // e.g. EQ-001 (also used as barcode)
  name: string;
  isUnique: boolean;
  available: number;
  qc: number;
  damaged: number;
  lost: number;
  total: number;
}

export type BorrowStatus = "OPEN" | "READY_FOR_PICKUP" | "CLOSED" | "UNFULFILLED";

export interface BorrowRequestItem {
  itemId: string;
  name: string;
  isUnique: boolean;
  reqQty: number;
  issuedQty: number;
}

export interface BorrowRequest {
  id: string;
  type: string;
  group: string;
  user: string;
  studentId: string;
  status: BorrowStatus;
  items: BorrowRequestItem[];
}

export interface PickupDetails {
  pickupAt: string;
  location: "locker" | "counter" | "lab";
  remark: string;
}

export interface IssuedLine {
  itemId: string;
  qty: number;
  sns: string[];
}

export interface StudentGroup {
  id: string;
  label: string;
}

export interface Student {
  studentId: string;
  name: string;
  groups: StudentGroup[];
}

export interface PendingReturnItem {
  id: string;
  name: string;
  isUnique: boolean;
}

export type ReturnDecision = "RETURNED" | "NOT_BROUGHT";

export type QCRequestStatus = "OPEN" | "PENDING_PAYMENT" | "CLOSED";
export type QCItemStatus = "PENDING_TEST" | "AVAILABLE" | "DAMAGED" | "LOST";

export interface QCItem {
  id: string;
  name: string;
  status: QCItemStatus;
}

export interface QCRequest {
  id: string;
  type: string;
  group: string;
  user: string;
  status: QCRequestStatus;
  fineAmount: number;
  fineRemark: string;
  items: QCItem[];
  slip?: { amount: number; transferredAt: string; refCode: string };
}

export interface QCSubmission {
  items: { id: string; status: Exclude<QCItemStatus, "PENDING_TEST"> }[];
  fineAmount: number;
  fineRemark: string;
}
