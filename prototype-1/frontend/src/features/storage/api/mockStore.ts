import type {
  BorrowRequest,
  InventoryItem,
  PendingReturnItem,
  QCRequest,
  Student,
} from "../types";

/**
 * In-memory stand-in for the backend (no storage module exists server-side yet).
 * Everything the api layer mutates lives here; swap storageApi.ts for real
 * fetch calls later without touching components or hooks.
 */
export const inventory: InventoryItem[] = [
  { id: "EQ-001", name: "Raspberry Pi 5 (8GB)", isUnique: true, available: 6, qc: 2, damaged: 2, lost: 0, total: 10 },
  { id: "EQ-002", name: "Breadboard 830 Points", isUnique: false, available: 42, qc: 5, damaged: 3, lost: 0, total: 50 },
  { id: "EQ-003", name: "Jumper Wire (M-M)", isUnique: false, available: 150, qc: 0, damaged: 40, lost: 10, total: 200 },
  { id: "EQ-004", name: "Servo Motor SG90", isUnique: true, available: 20, qc: 0, damaged: 0, lost: 0, total: 20 },
];

export const borrowRequests: BorrowRequest[] = [
  {
    id: "REQ-B-101", type: "Course - IoT System", group: "Group 09", user: "ภาคภูมิ", studentId: "6632199921", status: "OPEN",
    items: [
      { itemId: "EQ-001", name: "Raspberry Pi 5 (8GB)", isUnique: true, reqQty: 2, issuedQty: 0 },
      { itemId: "EQ-002", name: "Breadboard 830 Points", isUnique: false, reqQty: 5, issuedQty: 0 },
    ],
  },
  {
    id: "REQ-B-102", type: "Course - Hardware", group: "Group 02", user: "สมชาย", studentId: "6632199922", status: "CLOSED",
    items: [{ itemId: "EQ-002", name: "Breadboard 830 Points", isUnique: false, reqQty: 3, issuedQty: 3 }],
  },
  {
    id: "REQ-B-103", type: "Custom", group: "ชมรมหุ่นยนต์", user: "วิภาดา", studentId: "6632199923", status: "OPEN",
    items: [
      { itemId: "EQ-004", name: "Servo Motor SG90", isUnique: true, reqQty: 4, issuedQty: 0 },
      { itemId: "EQ-001", name: "Raspberry Pi 5 (8GB)", isUnique: true, reqQty: 1, issuedQty: 0 },
    ],
  },
  {
    id: "REQ-B-104", type: "Personal", group: "โปรเจกต์ส่วนตัว", user: "นพดล", studentId: "6632199924", status: "UNFULFILLED",
    items: [{ itemId: "EQ-003", name: "Jumper Wire (M-M)", isUnique: false, reqQty: 20, issuedQty: 0 }],
  },
];

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

/** Items a student still owes, keyed by studentId (Face-to-Face return). */
export const pendingReturns: Record<string, PendingReturnItem[]> = {
  "6632199921": [
    { id: "f1", name: "Raspberry Pi 5 [SN: EQ-001-451]", isUnique: true },
    { id: "f2", name: "Breadboard 830 Points (เหมาชนิด 5 ชิ้น)", isUnique: false },
  ],
};

export const qcRequests: QCRequest[] = [
  {
    id: "REQ-R-201", type: "Course - IoT System", group: "Group 09", user: "ภาคภูมิ", status: "OPEN", fineAmount: 0, fineRemark: "",
    items: [
      { id: "q1", name: "Raspberry Pi 5 [SN: EQ-001-101]", status: "PENDING_TEST" },
      { id: "q2", name: "Raspberry Pi 5 [SN: EQ-001-102]", status: "PENDING_TEST" },
      { id: "q3", name: "Breadboard 830 Points (เหมาชนิด)", status: "PENDING_TEST" },
    ],
  },
  {
    id: "REQ-R-202", type: "Course - Hardware", group: "Group 02", user: "สมชาย", status: "PENDING_PAYMENT", fineAmount: 1500,
    fineRemark: "Raspberry Pi สูญหาย 1 เครื่อง",
    items: [{ id: "q4", name: "Raspberry Pi 5 [SN: EQ-001-205]", status: "LOST" }],
    slip: { amount: 1500, transferredAt: "28 ต.ค. 2026 14:30", refCode: "REF-889021" },
  },
  {
    id: "REQ-R-203", type: "Personal", group: "โปรเจกต์ส่วนตัว", user: "นพดล", status: "CLOSED", fineAmount: 0, fineRemark: "",
    items: [{ id: "q5", name: "Servo Motor SG90 [SN: EQ-004-017]", status: "AVAILABLE" }],
  },
  {
    id: "REQ-R-204", type: "Custom", group: "ชมรมหุ่นยนต์", user: "วิภาดา", status: "OPEN", fineAmount: 0, fineRemark: "",
    items: [{ id: "q6", name: "Jumper Wire (M-M) (เหมาชนิด)", status: "PENDING_TEST" }],
  },
];
