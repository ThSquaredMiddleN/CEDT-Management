import type {
  BorrowRequest,
  InventoryItem,
  InventoryUnit,
  PendingReturnItem,
  QCRequest,
  Reservation,
  Student,
  UnitStatus,
} from "../types";

/**
 * In-memory stand-in for the backend (no storage module exists server-side yet).
 * Everything the api layer mutates lives here; swap storageApi.ts for real
 * fetch calls later without touching components or hooks.
 *
 * Stock model: `inventory` rows hold the stored counts. For Unique items the
 * counts are re-derived from `units` (see syncCounts); Bulk items keep counts.
 * Here `available` is PHYSICAL units on the shelf (reservations are subtracted
 * by stockLogic / the API view).
 */
export const clock = { now: () => Date.now() };
export const apiConfig = { latencyMs: 150 };

/** Restocked units stay reserved for flagged requests this long. */
export const RESERVATION_MS = 24 * 60 * 60 * 1000;

export const inventory: InventoryItem[] = [];
export const units: InventoryUnit[] = [];
export const reservations: Reservation[] = [];
export const borrowRequests: BorrowRequest[] = [];
export const qcRequests: QCRequest[] = [];
/** Items a student owes, keyed by studentId. */
export const pendingReturns: Record<string, PendingReturnItem[]> = {};

export const students: Student[] = [
  {
    studentId: "6632199921",
    name: "นาย ภาคภูมิ",
    groups: [
      { id: "group09", label: "Course - IoT System (Group 09)" },
      { id: "personal", label: "Personal - โปรเจกต์ส่วนตัว" },
    ],
  },
];

export function serialFor(itemId: string, n: number, width = 3): string {
  return `${itemId}-${String(n).padStart(width, "0")}`;
}

/** Create `count` units per status, numbering serials consecutively from `start`. */
export function createUnits(itemId: string, counts: Partial<Record<UnitStatus, number>>, start = 1): InventoryUnit[] {
  const created: InventoryUnit[] = [];
  let n = start;
  for (const status of ["AVAILABLE", "QC", "DAMAGED", "LOST", "OUT"] as UnitStatus[]) {
    for (let i = 0; i < (counts[status] ?? 0); i++) {
      created.push({ serial: serialFor(itemId, n++), itemId, status });
    }
  }
  units.push(...created);
  return created;
}

/** Re-derive a Unique item's counts from its unit records. */
export function syncCounts(item: InventoryItem): void {
  if (!item.isUnique) return;
  const mine = units.filter((u) => u.itemId === item.id);
  const count = (s: UnitStatus) => mine.filter((u) => u.status === s).length;
  item.available = count("AVAILABLE");
  item.qc = count("QC");
  item.damaged = count("DAMAGED");
  item.lost = count("LOST");
  item.total = mine.length;
}

export function syncAllCounts(): void {
  inventory.forEach(syncCounts);
}

const day = 24 * 60 * 60 * 1000;
const t0 = Date.parse("2026-11-10T09:00:00+07:00");

function seed() {
  inventory.push(
    { id: "EQ-001", name: "Raspberry Pi 5 (8GB)", isUnique: true, available: 0, reserved: 0, qc: 0, damaged: 0, lost: 0, total: 0 },
    // Bulk: total = available + qc + damaged + lost + units out with students.
    { id: "EQ-002", name: "Breadboard 830 Points", isUnique: false, available: 42, reserved: 0, qc: 5, damaged: 3, lost: 0, total: 55 },
    { id: "EQ-003", name: "Jumper Wire (M-M)", isUnique: false, available: 145, reserved: 0, qc: 5, damaged: 40, lost: 10, total: 200 },
    { id: "EQ-004", name: "Servo Motor SG90", isUnique: true, available: 0, reserved: 0, qc: 0, damaged: 0, lost: 0, total: 0 },
  );
  // EQ-001-001..005 shelf, 006-007 QC, 008-009 damaged, 010 lost, 011 out with a student.
  createUnits("EQ-001", { AVAILABLE: 5, QC: 2, DAMAGED: 2, LOST: 1, OUT: 1 });
  createUnits("EQ-004", { AVAILABLE: 20 });
  syncAllCounts();

  borrowRequests.push(
    {
      id: "REQ-B-101", type: "Course - IoT System", group: "Group 09", user: "ภาคภูมิ", studentId: "6632199921", status: "OPEN", createdAt: t0,
      items: [
        { itemId: "EQ-001", name: "Raspberry Pi 5 (8GB)", isUnique: true, reqQty: 2, issuedQty: 0 },
        { itemId: "EQ-002", name: "Breadboard 830 Points", isUnique: false, reqQty: 5, issuedQty: 0 },
      ],
    },
    {
      id: "REQ-B-102", type: "Course - Hardware", group: "Group 02", user: "สมชาย", studentId: "6632199922", status: "CLOSED", createdAt: t0 - day,
      items: [{ itemId: "EQ-002", name: "Breadboard 830 Points", isUnique: false, reqQty: 3, issuedQty: 3 }],
    },
    {
      id: "REQ-B-103", type: "Custom", group: "ชมรมหุ่นยนต์", user: "วิภาดา", studentId: "6632199923", status: "OPEN", createdAt: t0 + 1000,
      items: [
        { itemId: "EQ-004", name: "Servo Motor SG90", isUnique: true, reqQty: 4, issuedQty: 0 },
        { itemId: "EQ-001", name: "Raspberry Pi 5 (8GB)", isUnique: true, reqQty: 1, issuedQty: 0 },
      ],
    },
    {
      id: "REQ-B-104", type: "Personal", group: "โปรเจกต์ส่วนตัว", user: "นพดล", studentId: "6632199924", status: "UNFULFILLED", createdAt: t0 - 2 * day,
      items: [{ itemId: "EQ-003", name: "Jumper Wire (M-M)", isUnique: false, reqQty: 20, issuedQty: 0 }],
    },
  );

  pendingReturns["6632199921"] = [
    { id: "f1", itemId: "EQ-001", name: "Raspberry Pi 5 (8GB)", isUnique: true, qty: 1, serialNumber: "EQ-001-011", owedStatus: "OWED" },
    { id: "f2", itemId: "EQ-002", name: "Breadboard 830 Points", isUnique: false, qty: 5, owedStatus: "OWED" },
  ];

  qcRequests.push(
    {
      id: "REQ-R-201", type: "Course - IoT System", group: "Group 09", user: "ภาคภูมิ", status: "OPEN", fineAmount: 0, fineRemark: "",
      items: [
        { id: "q1", itemId: "EQ-001", name: "Raspberry Pi 5 (8GB)", isUnique: true, qty: 1, serialNumber: "EQ-001-006", status: "PENDING_TEST" },
        { id: "q2", itemId: "EQ-001", name: "Raspberry Pi 5 (8GB)", isUnique: true, qty: 1, serialNumber: "EQ-001-007", status: "PENDING_TEST" },
        { id: "q3", itemId: "EQ-002", name: "Breadboard 830 Points", isUnique: false, qty: 5, status: "PENDING_TEST" },
      ],
    },
    {
      id: "REQ-R-202", type: "Course - Hardware", group: "Group 02", user: "สมชาย", status: "PENDING_PAYMENT", fineAmount: 1500,
      fineRemark: "Raspberry Pi สูญหาย 1 เครื่อง",
      items: [{ id: "q4", itemId: "EQ-001", name: "Raspberry Pi 5 (8GB)", isUnique: true, qty: 1, serialNumber: "EQ-001-010", status: "LOST", results: { AVAILABLE: 0, DAMAGED: 0, LOST: 1 } }],
      slip: { amount: 1500, transferredAt: "28 ต.ค. 2026 14:30", refCode: "REF-889021" },
    },
    {
      id: "REQ-R-203", type: "Personal", group: "โปรเจกต์ส่วนตัว", user: "นพดล", status: "CLOSED", fineAmount: 0, fineRemark: "",
      items: [{ id: "q5", itemId: "EQ-004", name: "Servo Motor SG90", isUnique: true, qty: 1, serialNumber: "EQ-004-017", status: "AVAILABLE", results: { AVAILABLE: 1, DAMAGED: 0, LOST: 0 } }],
    },
    {
      id: "REQ-R-204", type: "Custom", group: "ชมรมหุ่นยนต์", user: "วิภาดา", status: "OPEN", fineAmount: 0, fineRemark: "",
      items: [{ id: "q6", itemId: "EQ-003", name: "Jumper Wire (M-M)", isUnique: false, qty: 5, status: "PENDING_TEST" }],
    },
  );
}

/** Restore the seed data in place (arrays keep their identity). Used by tests. */
export function resetMockStore(): void {
  for (const arr of [inventory, units, reservations, borrowRequests, qcRequests]) arr.length = 0;
  for (const k of Object.keys(pendingReturns)) delete pendingReturns[k];
  clock.now = () => Date.now();
  seed();
}

seed();
