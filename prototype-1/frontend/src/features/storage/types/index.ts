/**
 * Stock view served to the UI. Counts for Unique items are derived from unit
 * records; Bulk items keep counts. `available` is the general pool: physical
 * units on the shelf minus units reserved for restock-flagged requests.
 *   total = available + reserved + qc + damaged + lost + (units out with students)
 */
export interface InventoryItem {
  id: string; // e.g. EQ-001 (also used as barcode)
  name: string;
  isUnique: boolean;
  available: number;
  reserved: number;
  qc: number;
  damaged: number;
  lost: number;
  total: number;
  /** Serials of available units (Unique items only). */
  availableSerials?: string[];
  /** One picture per equipment type; serial-numbered units share it. */
  imageUrl?: string;
}

export interface NewInventoryItem {
  id: string;
  name: string;
  isUnique: boolean;
  total: number;
  imageUrl?: string;
}

export type UnitStatus = "AVAILABLE" | "OUT" | "QC" | "DAMAGED" | "LOST";

/** One physical Unique unit, e.g. EQ-001-003. */
export interface InventoryUnit {
  serial: string;
  itemId: string;
  status: UnitStatus;
  requestId?: string;
}

/** Units held back for a restock-flagged request until `expiresAt` (epoch ms). */
export interface Reservation {
  requestId: string;
  itemId: string;
  qty: number;
  expiresAt: number;
}

export type BorrowStatus = "OPEN" | "READY_FOR_PICKUP" | "CLOSED" | "UNFULFILLED" | "CANCELLED";

export type CancelReason = "BY_STUDENT" | "RESTOCK_EXPIRED";

export interface BorrowRequestItem {
  itemId: string;
  name: string;
  isUnique: boolean;
  reqQty: number;
  issuedQty: number;
  /** Filled by the API: units this request could be issued right now (pool + its own reservation). */
  available?: number;
  availableSerials?: string[];
  /** Filled by the API: serials of the units handed out against this request. */
  issuedSerials?: string[];
}

export interface BorrowRequest {
  id: string;
  type: string;
  /** Owning group. Any member may act on the request. */
  groupId: string;
  /** Group label, for display. */
  group: string;
  /** Who submitted it. */
  user: string;
  studentId: string;
  status: BorrowStatus;
  /** Queue position: earlier requests are served first, and reopening keeps it. */
  createdAt: number;
  /** Set on UNFULFILLED requests when stock came back; units are held until `expiresAt`. */
  restock?: { flaggedAt: number; expiresAt: number };
  /** Set when status is CANCELLED. */
  cancelReason?: CancelReason;
  /** Set by staff when the request is issued. */
  pickup?: PickupDetails;
  /** Epoch ms when a group member (or staff) confirmed pickup. */
  pickedUpAt?: number;
  /** Epoch ms the items are due back. Copied from the default at pickup; staff may edit it. */
  dueAt?: number;
  items: BorrowRequestItem[];
}

/** What a student sends to create a request. */
export interface NewBorrowRequest {
  groupId: string;
  items: { itemId: string; qty: number }[];
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
  /** Becomes BorrowRequest.type, e.g. "Course - IoT System", "Custom", "Personal". */
  type: string;
}

export interface Student {
  studentId: string;
  name: string;
  groups: StudentGroup[];
}

/** Physical thing a group owes. Unique = one unit with a serial; bulk = qty of a type. */
export interface PendingReturnItem {
  id: string;
  itemId: string; // InventoryItem.id
  name: string; // type name only; serial/qty are rendered separately
  isUnique: boolean;
  qty: number; // always 1 for unique items
  serialNumber?: string;
  owedStatus: "OWED" | "NOT_BROUGHT";
  /** Epoch ms when the student first said they did not bring it. */
  notBroughtAt?: number;
  requestId: string;
  groupId: string;
  /** Group label, for display. */
  group: string;
  /** Epoch ms; follows the request's dueAt. */
  dueAt: number;
}

/** LOST is only valid for items already marked NOT_BROUGHT. */
export type ReturnDecision = "RETURNED" | "NOT_BROUGHT" | "LOST";

/** How a returned line is split: counts must add up to its qty (unique items: exactly one is 1). */
export type ReturnCounts = Record<ReturnDecision, number>;

export interface ReturnFine {
  amount: number;
  remark: string;
}

export type QCRequestStatus = "OPEN" | "PENDING_PAYMENT" | "CLOSED";
export type QCItemStatus = "PENDING_TEST" | "AVAILABLE" | "DAMAGED" | "LOST";
export type QCDecision = Exclude<QCItemStatus, "PENDING_TEST">;

/** Counts per outcome; they must add up to the item's qty (unique items: exactly one is 1). */
export type QCResults = Record<QCDecision, number>;

export interface QCItem {
  id: string;
  itemId: string; // InventoryItem.id
  name: string;
  isUnique: boolean;
  qty: number;
  serialNumber?: string;
  /** PENDING_TEST until inspected, then the worst outcome (LOST > DAMAGED > AVAILABLE). */
  status: QCItemStatus;
  results?: QCResults;
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
  items: { id: string; results: QCResults }[];
  fineAmount: number;
  fineRemark: string;
}
