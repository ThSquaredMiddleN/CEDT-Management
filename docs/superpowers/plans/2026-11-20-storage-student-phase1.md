# Storage Student Side, Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let students browse storage, create borrow requests for their groups, track them through pickup, reopen after a restock, and see what their groups owe with due dates. Also add the staff-side pieces this needs.

**Architecture:** Extend the shared in-memory mock (`api/mockStore.ts`, `api/stockLogic.ts`, `api/storageApi.ts`) with a mock "current student", group-scoped requests and owed items, cancel and pickup transitions, and per-request due dates. One student hub page (`/student/storage`) with three URL-driven tabs reuses the shared react-query hooks, so staff and student pages see the same state in one browser tab.

**Tech Stack:** React 18 + TypeScript, react-router-dom, @tanstack/react-query, Tailwind (design tokens such as `text-grey-900`, `status-*`, `brand-primary`), lucide-react, vitest.

**Spec:** `docs/superpowers/specs/2026-11-20-storage-student-phase1-design.md`

**Working directory for all commands:** `prototype-1/frontend`

**Commits:** the user approves commits. Each task ends with a commit step. Run it only if the user has said commits are OK for this run; otherwise skip it and leave the changes uncommitted.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `src/features/storage/types/index.ts` | modify | new fields: `groupId`, `cancelReason`, `pickup`, `pickedUpAt`, `dueAt`, `StudentGroup.type`, owed-item request/group/due, `NewBorrowRequest`, `issuedSerials` |
| `src/features/storage/api/mockStore.ts` | modify | seed students and groups, flat `pendingReturns`, `session`, `settings`, seed `REQ-B-100` |
| `src/features/storage/api/stockLogic.ts` | modify | `releaseReservations`, auto-cancel on restock expiry, clearer late-reopen error |
| `src/features/storage/api/storageApi.ts` | modify | group-scoped owed items, student calls, cancel, pickup, due dates |
| `src/features/storage/api/storageApi.test.ts` | modify | tests for all new API behaviour |
| `src/features/storage/api/hooks.ts` | modify | hooks for new calls |
| `src/features/storage/components/dates.ts` | create | date formatting, countdown, datetime-local conversion, due tone, `useNow` |
| `src/features/storage/components/dates.test.ts` | create | tests for the pure date helpers |
| `src/features/storage/components/Tabs.tsx` | create | underline tabs with count badges |
| `src/features/storage/components/badges.tsx` | modify | `CANCELLED` style, `RequestStatusPill`, `DueBadge` |
| `src/features/storage/components/layout.tsx` | modify | `ConfirmDialog` |
| `src/features/storage/components/PickupCard.tsx` | create | pickup location, time and remark (student and staff) |
| `src/features/storage/components/RestockBanner.tsx` | create | "stock is back" banner with countdown and reopen |
| `src/features/storage/components/DevStudentSwitcher.tsx` | create | dev-only student picker |
| `src/features/storage/components/RequestForm.tsx` | create | cart column and `QtyStepper` |
| `src/features/storage/components/DefaultDueDateField.tsx` | create | staff default due date setting |
| `src/features/storage/components/DueDateEditor.tsx` | create | staff per-request due date editor |
| `src/features/storage/components/ReturnItemRow.tsx` | modify | show request id, group and due date |
| `src/features/storage/routes/CatalogPage.tsx` | create | borrow tab: card grid and cart |
| `src/features/storage/routes/MyRequestsPage.tsx` | create | requests tab: list and detail side by side |
| `src/features/storage/routes/OwedPage.tsx` | create | to-return tab: owed items table |
| `src/features/storage/routes/StudentStoragePage.tsx` | create | hub: banner, tabs, URL state |
| `src/features/storage/routes/StorageDashboardPage.tsx` | modify | add `DefaultDueDateField` |
| `src/features/storage/routes/BorrowDetailPage.tsx` | modify | pickup card, staff confirm pickup, due editor, cancelled message |
| `src/features/storage/routes/BorrowListPage.tsx` | modify | hide cancelled behind a toggle, show cancel reason |
| `src/features/student/layout/StudentLayout.tsx` | modify | sidebar item "คลังอุปกรณ์" |
| `src/app/router.tsx` | modify | `/student/storage` route |

---

### Task 1: Data model and group-scoped owed items

Owed items move from a per-student record to one flat list tagged with `groupId`. A student sees the owed items of all their groups. Seed students get real groups with types, and a second Group 09 member exists for shared-group testing.

**Files:**
- Modify: `src/features/storage/types/index.ts`
- Modify: `src/features/storage/api/mockStore.ts`
- Modify: `src/features/storage/api/storageApi.ts`
- Test: `src/features/storage/api/storageApi.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/features/storage/api/storageApi.test.ts`:

```ts
describe("group-owned items", () => {
  it("shows the group's owed items to every member of the group", async () => {
    const owed = await storageApi.getPendingReturns("6632199925"); // second member of Group 09
    expect(owed.map((i) => [i.id, i.requestId, i.groupId])).toEqual([
      ["f1", "REQ-B-100", "group09"],
      ["f2", "REQ-B-100", "group09"],
    ]);
  });

  it("lets another member of the group return the items", async () => {
    await storageApi.submitReturn("6632199925", { f1: rc(1, 0, 0), f2: rc(5, 0, 0) }, "");
    expect(await storageApi.getPendingReturns("6632199921")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/storage/api/storageApi.test.ts -t "group-owned"`
Expected: FAIL. The first test gets `[]` because student `6632199925` doesn't exist.

- [ ] **Step 3: Update the types**

In `src/features/storage/types/index.ts`, replace the `BorrowStatus` line, the `BorrowRequestItem`, `BorrowRequest`, `StudentGroup` and `PendingReturnItem` interfaces with:

```ts
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
```

```ts
export interface StudentGroup {
  id: string;
  label: string;
  /** Becomes BorrowRequest.type, e.g. "Course - IoT System", "Custom", "Personal". */
  type: string;
}
```

```ts
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
```

- [ ] **Step 4: Update the mock store**

In `src/features/storage/api/mockStore.ts`:

Change the type import to also import `StudentGroup`:

```ts
import type {
  BorrowRequest,
  InventoryItem,
  InventoryUnit,
  PendingReturnItem,
  QCRequest,
  Reservation,
  Student,
  StudentGroup,
  UnitStatus,
} from "../types";
```

Replace the block from `export const RESERVATION_MS` through the end of the `students` array with:

```ts
/** Restocked units stay reserved for flagged requests this long. */
export const RESERVATION_MS = 24 * 60 * 60 * 1000;

/** Seed default due date: end of the current semester. */
export const SEMESTER_END = Date.parse("2027-03-31T17:00:00+07:00");

export const inventory: InventoryItem[] = [];
export const units: InventoryUnit[] = [];
export const reservations: Reservation[] = [];
export const borrowRequests: BorrowRequest[] = [];
export const qcRequests: QCRequest[] = [];
/** Items groups owe. Each item belongs to the group of the request it came from. */
export const pendingReturns: PendingReturnItem[] = [];

/** Mock "logged-in student" until real student auth exists. */
export const session = { studentId: "6632199921" };
/** Staff-set settings. */
export const settings = { defaultDueAt: SEMESTER_END };

const personal = (studentId: string): StudentGroup => ({
  id: `personal-${studentId}`,
  label: "ส่วนตัว",
  type: "Personal",
});
const GROUP09: StudentGroup = { id: "group09", label: "Group 09", type: "Course - IoT System" };
const GROUP02: StudentGroup = { id: "group02", label: "Group 02", type: "Course - Hardware" };
const ROBOTICS: StudentGroup = { id: "robotics-club", label: "ชมรมหุ่นยนต์", type: "Custom" };

export const students: Student[] = [
  { studentId: "6632199921", name: "นาย ภาคภูมิ", groups: [GROUP09, personal("6632199921")] },
  // Second Group 09 member, for testing shared group ownership.
  { studentId: "6632199925", name: "นางสาว กานต์ธิดา", groups: [GROUP09, ROBOTICS, personal("6632199925")] },
  { studentId: "6632199922", name: "นาย สมชาย", groups: [GROUP02, personal("6632199922")] },
  { studentId: "6632199923", name: "นางสาว วิภาดา", groups: [ROBOTICS, personal("6632199923")] },
  { studentId: "6632199924", name: "นาย นพดล", groups: [personal("6632199924")] },
];
```

In `seed()`, after `createUnits("EQ-004", { AVAILABLE: 20 });` add:

```ts
  // The unit out with a student was issued against the seed request REQ-B-100.
  units.find((u) => u.serial === "EQ-001-011")!.requestId = "REQ-B-100";
```

Replace the whole `borrowRequests.push(...)` call with:

```ts
  borrowRequests.push(
    {
      id: "REQ-B-100", type: "Course - IoT System", groupId: "group09", group: "Group 09", user: "ภาคภูมิ", studentId: "6632199921",
      status: "CLOSED", createdAt: t0 - 10 * day, pickedUpAt: t0 - 9 * day, dueAt: SEMESTER_END,
      pickup: { pickupAt: "2026-11-01T10:00", location: "counter", remark: "" },
      items: [
        { itemId: "EQ-001", name: "Raspberry Pi 5 (8GB)", isUnique: true, reqQty: 1, issuedQty: 1 },
        { itemId: "EQ-002", name: "Breadboard 830 Points", isUnique: false, reqQty: 5, issuedQty: 5 },
      ],
    },
    {
      id: "REQ-B-101", type: "Course - IoT System", groupId: "group09", group: "Group 09", user: "ภาคภูมิ", studentId: "6632199921",
      status: "OPEN", createdAt: t0,
      items: [
        { itemId: "EQ-001", name: "Raspberry Pi 5 (8GB)", isUnique: true, reqQty: 2, issuedQty: 0 },
        { itemId: "EQ-002", name: "Breadboard 830 Points", isUnique: false, reqQty: 5, issuedQty: 0 },
      ],
    },
    {
      id: "REQ-B-102", type: "Course - Hardware", groupId: "group02", group: "Group 02", user: "สมชาย", studentId: "6632199922",
      status: "CLOSED", createdAt: t0 - day,
      items: [{ itemId: "EQ-002", name: "Breadboard 830 Points", isUnique: false, reqQty: 3, issuedQty: 3 }],
    },
    {
      id: "REQ-B-103", type: "Custom", groupId: "robotics-club", group: "ชมรมหุ่นยนต์", user: "วิภาดา", studentId: "6632199923",
      status: "OPEN", createdAt: t0 + 1000,
      items: [
        { itemId: "EQ-004", name: "Servo Motor SG90", isUnique: true, reqQty: 4, issuedQty: 0 },
        { itemId: "EQ-001", name: "Raspberry Pi 5 (8GB)", isUnique: true, reqQty: 1, issuedQty: 0 },
      ],
    },
    {
      id: "REQ-B-104", type: "Personal", groupId: "personal-6632199924", group: "ส่วนตัว", user: "นพดล", studentId: "6632199924",
      status: "UNFULFILLED", createdAt: t0 - 2 * day,
      items: [{ itemId: "EQ-003", name: "Jumper Wire (M-M)", isUnique: false, reqQty: 20, issuedQty: 0 }],
    },
  );
```

Replace the `pendingReturns["6632199921"] = [...]` assignment with:

```ts
  const owedBase = { requestId: "REQ-B-100", groupId: "group09", group: "Group 09", dueAt: SEMESTER_END, owedStatus: "OWED" as const };
  pendingReturns.push(
    { ...owedBase, id: "f1", itemId: "EQ-001", name: "Raspberry Pi 5 (8GB)", isUnique: true, qty: 1, serialNumber: "EQ-001-011" },
    { ...owedBase, id: "f2", itemId: "EQ-002", name: "Breadboard 830 Points", isUnique: false, qty: 5 },
  );
```

Replace `resetMockStore` with:

```ts
/** Restore the seed data in place (arrays keep their identity). Used by tests. */
export function resetMockStore(): void {
  for (const arr of [inventory, units, reservations, borrowRequests, qcRequests, pendingReturns]) arr.length = 0;
  clock.now = () => Date.now();
  session.studentId = "6632199921";
  settings.defaultDueAt = SEMESTER_END;
  seed();
}
```

- [ ] **Step 5: Make the API group-scoped**

In `src/features/storage/api/storageApi.ts`, after the `availableSerials` helper, add:

```ts
/** Group ids the student belongs to (empty when the student is unknown). */
const groupIdsOf = (studentId: string): Set<string> =>
  new Set(students.find((s) => s.studentId === studentId)?.groups.map((g) => g.id) ?? []);

/** Owed items of every group the student belongs to. */
const owedFor = (studentId: string): PendingReturnItem[] => {
  const ids = groupIdsOf(studentId);
  return pendingReturns.filter((i) => ids.has(i.groupId));
};

/** Not brought first, then overdue, then soonest due. */
export function sortOwed(items: PendingReturnItem[], now: number): PendingReturnItem[] {
  const rank = (i: PendingReturnItem) => (i.owedStatus === "NOT_BROUGHT" ? 0 : i.dueAt < now ? 1 : 2);
  return [...items].sort((a, b) => rank(a) - rank(b) || a.dueAt - b.dueAt);
}
```

Replace `getPendingReturns` with:

```ts
  /** Staff: owed items of all the student's groups. Not brought first, then overdue, then soonest due. */
  getPendingReturns: (studentId: string): Promise<PendingReturnItem[]> =>
    delay(sortOwed(owedFor(studentId), clock.now())),
```

In `submitReturn`, change the first line of the body from
`const owed = pendingReturns[studentId] ?? [];` to:

```ts
    const owed = owedFor(studentId);
```

and replace the final block, from `const now = clock.now();` through the `pendingReturns[studentId] = plan ...;` statement, with:

```ts
    const now = clock.now();
    const handled = new Set(owed.map((i) => i.id));
    for (let k = pendingReturns.length - 1; k >= 0; k--) {
      if (handled.has(pendingReturns[k].id)) pendingReturns.splice(k, 1);
    }
    pendingReturns.push(
      ...plan
        .filter(({ r }) => r.NOT_BROUGHT > 0)
        .map(({ i, r }) => ({ ...i, qty: r.NOT_BROUGHT, owedStatus: "NOT_BROUGHT" as const, notBroughtAt: i.notBroughtAt ?? now })),
    );
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `npx vitest run src/features/storage`
Expected: PASS, 16 tests (14 existing plus 2 new).

Run: `npm run typecheck`
Expected: no errors. If any page builds a `StudentGroup` or `BorrowRequest` literal, the error points at it. Add the missing field there.

- [ ] **Step 7: Commit (only if commits are approved)**

```bash
git add src/features/storage/types/index.ts src/features/storage/api/mockStore.ts src/features/storage/api/storageApi.ts src/features/storage/api/storageApi.test.ts
git commit -m "feat(storage): group-owned requests and owed items in the mock"
```

---

### Task 2: Current student, create request, my requests

**Files:**
- Modify: `src/features/storage/api/storageApi.ts`
- Test: `src/features/storage/api/storageApi.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/features/storage/api/storageApi.test.ts`:

```ts
describe("student requests", () => {
  it("creates an OPEN request for one of my groups, with the type taken from the group", async () => {
    const req = await storageApi.createBorrowRequest({ groupId: "group09", items: [{ itemId: "EQ-004", qty: 2 }] });
    expect(req).toMatchObject({
      id: "REQ-B-105",
      status: "OPEN",
      groupId: "group09",
      group: "Group 09",
      type: "Course - IoT System",
      studentId: "6632199921",
    });
    expect(req.items).toEqual([{ itemId: "EQ-004", name: "Servo Motor SG90", isUnique: true, reqQty: 2, issuedQty: 0 }]);
  });

  it("accepts more than is available, queueing the request", async () => {
    await storageApi.walkInCheckout("x", "g", [pis(5)]); // shelf now has no Pis
    const req = await storageApi.createBorrowRequest({ groupId: "group09", items: [{ itemId: "EQ-001", qty: 3 }] });
    expect(req.status).toBe("UNFULFILLED"); // nothing issuable, so the sweep rule applies at once
  });

  it("rejects an empty cart, bad quantities and groups I'm not in", async () => {
    const create = (groupId: string, items: { itemId: string; qty: number }[]) =>
      storageApi.createBorrowRequest({ groupId, items });
    await expect(create("group09", [])).rejects.toThrow(/ยังไม่ได้เลือก/);
    await expect(create("group09", [{ itemId: "EQ-001", qty: 0 }])).rejects.toThrow(/ระหว่าง/);
    await expect(create("group09", [{ itemId: "EQ-001", qty: 12 }])).rejects.toThrow(/ระหว่าง/); // total is 11
    await expect(create("robotics-club", [{ itemId: "EQ-001", qty: 1 }])).rejects.toThrow(/ไม่ได้อยู่ในกลุ่ม/);
  });

  it("lists only my groups' requests, newest first, and follows the current student", async () => {
    expect((await storageApi.getCurrentStudent()).studentId).toBe("6632199921");
    expect((await storageApi.getMyRequests()).map((r) => r.id)).toEqual(["REQ-B-101", "REQ-B-100"]);

    await storageApi.setCurrentStudent("6632199925"); // Group 09 + robotics club
    expect((await storageApi.getMyRequests()).map((r) => r.id)).toEqual(["REQ-B-103", "REQ-B-101", "REQ-B-100"]);
  });

  it("decorates my requests with the serials issued against them", async () => {
    const [, closed] = await storageApi.getMyRequests();
    expect(closed.items.find((i) => i.itemId === "EQ-001")!.issuedSerials).toEqual(["EQ-001-011"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/storage/api/storageApi.test.ts -t "student requests"`
Expected: FAIL with `storageApi.createBorrowRequest is not a function`.

- [ ] **Step 3: Implement**

In `src/features/storage/api/storageApi.ts`:

Add `NewBorrowRequest` to the type import list, and add `session` and `settings` to the `./mockStore` import list.

After `nextQcId`, add:

```ts
function nextBorrowId(): string {
  const max = borrowRequests.reduce((m, r) => Math.max(m, Number(r.id.split("-").pop()) || 0), 0);
  return `REQ-B-${max + 1}`;
}

function currentStudent(): Student {
  const s = students.find((x) => x.studentId === session.studentId);
  if (!s) throw new Error("ไม่พบข้อมูลนิสิต");
  return s;
}

/** Request as the UI sees it: what each line could be issued now, and which serials it holds. */
function decorate(req: BorrowRequest): BorrowRequest {
  return {
    ...req,
    items: req.items.map((it) => ({
      ...it,
      available: issuableQty(it.itemId, req.id),
      availableSerials: it.isUnique ? availableSerials(it.itemId) : undefined,
      issuedSerials: it.isUnique
        ? units.filter((u) => u.itemId === it.itemId && u.requestId === req.id).map((u) => u.serial)
        : undefined,
    })),
  };
}
```

Replace the body of `getBorrowRequest` with:

```ts
  getBorrowRequest: async (id: string): Promise<BorrowRequest> => {
    expireReservations();
    const req = borrowRequests.find((r) => r.id === id);
    if (!req) return fail("ไม่พบคำขอ");
    return delay(decorate(req!));
  },
```

Add these entries to the `storageApi` object (after `lookupStudent`):

```ts
  // ---- Student side (mock identity until real student auth exists) ----

  getCurrentStudent: async (): Promise<Student> => delay(currentStudent()),

  /** Dev switcher: every seeded student. */
  listStudents: async (): Promise<Student[]> => delay(students),

  setCurrentStudent: async (studentId: string): Promise<{ studentId: string }> => {
    if (!students.some((s) => s.studentId === studentId)) return fail("ไม่พบรหัสนิสิตนี้");
    session.studentId = studentId;
    return delay({ studentId });
  },

  /**
   * A line may ask for more than is available (it waits in the queue) but never more
   * than the item's total. A request with nothing issuable is swept to UNFULFILLED at once.
   */
  createBorrowRequest: async (input: NewBorrowRequest): Promise<BorrowRequest> => {
    expireReservations();
    syncAllCounts();
    const student = currentStudent();
    const group = student.groups.find((g) => g.id === input.groupId);
    if (!group) return fail("คุณไม่ได้อยู่ในกลุ่มนี้");
    if (input.items.length === 0) return fail("ยังไม่ได้เลือกอุปกรณ์");
    if (new Set(input.items.map((l) => l.itemId)).size !== input.items.length) return fail("รายการอุปกรณ์ซ้ำกัน");
    const lines = input.items.map((l) => {
      const item = findItem(l.itemId);
      if (!item) return fail(`ไม่พบอุปกรณ์ ${l.itemId}`);
      if (!Number.isInteger(l.qty) || l.qty < 1 || l.qty > item!.total) {
        return fail(`จำนวน ${item!.name} ต้องอยู่ระหว่าง 1–${item!.total}`);
      }
      return { itemId: item!.id, name: item!.name, isUnique: item!.isUnique, reqQty: l.qty, issuedQty: 0 };
    });
    const req: BorrowRequest = {
      id: nextBorrowId(),
      type: group!.type,
      groupId: group!.id,
      group: group!.label,
      user: student.name,
      studentId: student.studentId,
      status: "OPEN",
      createdAt: clock.now(),
      items: lines,
    };
    borrowRequests.push(req);
    sweepRequests();
    return delay(req);
  },

  /** Requests of all the current student's groups, newest first. */
  getMyRequests: async (): Promise<BorrowRequest[]> => {
    expireReservations();
    const ids = groupIdsOf(session.studentId);
    return delay(
      borrowRequests
        .filter((r) => ids.has(r.groupId))
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(decorate),
    );
  },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/features/storage`
Expected: PASS, 21 tests.

- [ ] **Step 5: Commit (only if commits are approved)**

```bash
git add src/features/storage/api/storageApi.ts src/features/storage/api/storageApi.test.ts
git commit -m "feat(storage): student identity, create request and my requests"
```

---

### Task 3: Cancel, and auto-cancel when a restock window expires

**Files:**
- Modify: `src/features/storage/api/stockLogic.ts`
- Modify: `src/features/storage/api/storageApi.ts`
- Test: `src/features/storage/api/storageApi.test.ts`

- [ ] **Step 1: Move the `restock` test helper to the top level**

In `src/features/storage/api/storageApi.test.ts`, cut the `async function restock() { ... }` block out of `describe("restock flag and reservation", ...)` and paste it right after `sellOutB101()` at the top level, unchanged. The existing tests in that `describe` keep calling `restock()`.

- [ ] **Step 2: Write the failing tests**

Append:

```ts
describe("cancel and restock expiry", () => {
  it("cancels an OPEN request", async () => {
    const req = await storageApi.cancelBorrow("REQ-B-101");
    expect(req).toMatchObject({ status: "CANCELLED", cancelReason: "BY_STUDENT" });
  });

  it("frees reserved units when a restock-flagged request is cancelled", async () => {
    await restock();
    expect((await inv("EQ-001")).reserved).toBe(2);
    await storageApi.cancelBorrow("REQ-B-101");
    const pi = await inv("EQ-001");
    expect(pi.reserved).toBe(0);
    expect(pi.available).toBe(2);
  });

  it("rejects cancelling a request that was already issued", async () => {
    await storageApi.confirmBorrow("REQ-B-103", [{ itemId: "EQ-004", qty: 1, sns: ["EQ-004-001"] }], pickup);
    await expect(storageApi.cancelBorrow("REQ-B-103")).rejects.toThrow(/ยกเลิกได้เฉพาะ/);
  });

  it("auto-cancels a flagged request that is not reopened within 24 hours", async () => {
    await restock();
    const start = Date.now();
    clock.now = () => start + 25 * HOUR;
    const req = (await storageApi.getBorrowRequests()).find((r) => r.id === "REQ-B-101")!;
    expect(req).toMatchObject({ status: "CANCELLED", cancelReason: "RESTOCK_EXPIRED" });
    expect(req.restock).toBeUndefined();
    await expect(storageApi.reopenBorrow("REQ-B-101")).rejects.toThrow(/หมดเวลาเปิดคำขอแล้ว/);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/features/storage/api/storageApi.test.ts -t "cancel and restock expiry"`
Expected: FAIL with `storageApi.cancelBorrow is not a function`.

- [ ] **Step 4: Implement in stock logic**

In `src/features/storage/api/stockLogic.ts`, replace `expireReservations` with:

```ts
/** Remove every reservation held for a request (units go back to the general pool). */
export function releaseReservations(requestId: string): void {
  for (let i = reservations.length - 1; i >= 0; i--) {
    if (reservations[i].requestId === requestId) reservations.splice(i, 1);
  }
}

/**
 * Drop expired reservations. A flagged UNFULFILLED request whose hold window has passed
 * is cancelled (RESTOCK_EXPIRED); a flag that no longer holds any units is cleared.
 */
export function expireReservations(): void {
  const now = clock.now();
  for (let i = reservations.length - 1; i >= 0; i--) {
    if (reservations[i].expiresAt <= now) reservations.splice(i, 1);
  }
  for (const req of borrowRequests) {
    if (!req.restock || req.status !== "UNFULFILLED") continue;
    if (req.restock.expiresAt <= now) {
      req.status = "CANCELLED";
      req.cancelReason = "RESTOCK_EXPIRED";
      delete req.restock;
      releaseReservations(req.id);
    } else if (!reservations.some((r) => r.requestId === req.id)) {
      delete req.restock;
    }
  }
}
```

In `reopenRequest`, add as the first line of the body:

```ts
  if (req.status === "CANCELLED" && req.cancelReason === "RESTOCK_EXPIRED") throw new Error("หมดเวลาเปิดคำขอแล้ว");
```

- [ ] **Step 5: Implement `cancelBorrow`**

In `src/features/storage/api/storageApi.ts`, add `releaseReservations` to the `./stockLogic` import list, and add after `reopenBorrow`:

```ts
  /** Student cancels before anything was issued. Reserved units go back to the pool. */
  cancelBorrow: async (id: string): Promise<BorrowRequest> => {
    expireReservations();
    const req = borrowRequests.find((r) => r.id === id);
    if (!req) return fail("ไม่พบคำขอ");
    if (req!.status !== "OPEN" && req!.status !== "UNFULFILLED") return fail("ยกเลิกได้เฉพาะคำขอที่ยังไม่ได้จ่ายของ");
    req!.status = "CANCELLED";
    req!.cancelReason = "BY_STUDENT";
    delete req!.restock;
    releaseReservations(req!.id);
    return delay(req!);
  },
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/features/storage`
Expected: PASS, 25 tests. The existing test "releases units to the pool after 24 hours and blocks a late reopen" still passes, because the reopen still rejects.

- [ ] **Step 7: Commit (only if commits are approved)**

```bash
git add src/features/storage/api/stockLogic.ts src/features/storage/api/storageApi.ts src/features/storage/api/storageApi.test.ts
git commit -m "feat(storage): cancel requests and auto-cancel expired restock holds"
```

---

### Task 4: Pickup details, confirm pickup, due dates

**Files:**
- Modify: `src/features/storage/api/storageApi.ts`
- Test: `src/features/storage/api/storageApi.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/features/storage/api/storageApi.test.ts`, change the mock store import to:

```ts
import { SEMESTER_END, apiConfig, clock, pendingReturns, resetMockStore, units } from "./mockStore";
```

Add near the other constants at the top:

```ts
const DAY = 24 * HOUR;
```

Append:

```ts
describe("pickup and due dates", () => {
  const DUE = Date.now() + 120 * DAY;
  const issueB103 = () =>
    storageApi.confirmBorrow("REQ-B-103", [{ itemId: "EQ-004", qty: 2, sns: ["EQ-004-001", "EQ-004-002"] }], pickup);

  it("stores the pickup details staff set", async () => {
    await issueB103();
    const req = await storageApi.getBorrowRequest("REQ-B-103");
    expect(req.status).toBe("READY_FOR_PICKUP");
    expect(req.pickup).toEqual(pickup);
  });

  it("closes on pickup, copies the default due date and makes the items owed by the group", async () => {
    await issueB103();
    await storageApi.setDefaultDueAt(DUE);
    const req = await storageApi.confirmPickup("REQ-B-103");
    expect(req).toMatchObject({ status: "CLOSED", dueAt: DUE });
    expect(req.pickedUpAt).toBeTypeOf("number");

    await storageApi.setCurrentStudent("6632199923"); // วิภาดา, robotics club
    const owed = await storageApi.getMyPendingReturns();
    expect(owed.map((i) => [i.serialNumber, i.requestId, i.groupId, i.dueAt])).toEqual([
      ["EQ-004-001", "REQ-B-103", "robotics-club", DUE],
      ["EQ-004-002", "REQ-B-103", "robotics-club", DUE],
    ]);
    await expect(storageApi.confirmPickup("REQ-B-103")).rejects.toThrow(/ยังไม่พร้อม/);
  });

  it("rejects a default due date in the past", async () => {
    await expect(storageApi.setDefaultDueAt(Date.now() - DAY)).rejects.toThrow(/อนาคต/);
  });

  it("moves the due date of one request and of its owed items", async () => {
    await issueB103();
    await storageApi.confirmPickup("REQ-B-103");
    const later = DUE + 7 * DAY;
    const req = await storageApi.setRequestDueAt("REQ-B-103", later);
    expect(req.dueAt).toBe(later);
    expect(pendingReturns.filter((i) => i.requestId === "REQ-B-103").map((i) => i.dueAt)).toEqual([later, later]);

    await expect(storageApi.setRequestDueAt("REQ-B-103", 0)).rejects.toThrow(/ไม่ก่อนวันที่รับของ/);
    await expect(storageApi.setRequestDueAt("REQ-B-101", later)).rejects.toThrow(/เฉพาะคำขอที่รับของแล้ว/);
  });

  it("sorts my owed items: not brought, then overdue, then soonest due", async () => {
    const start = SEMESTER_END - 30 * DAY; // fixed clock: seed items are due at SEMESTER_END
    clock.now = () => start;
    const req = await storageApi.createBorrowRequest({ groupId: "group09", items: [{ itemId: "EQ-002", qty: 2 }] });
    await storageApi.confirmBorrow(req.id, [bulk("EQ-002", 2)], pickup);
    await storageApi.confirmPickup(req.id);
    await storageApi.setRequestDueAt(req.id, start + HOUR);
    clock.now = () => start + 2 * HOUR; // the new request is now overdue
    pendingReturns.find((i) => i.id === "f1")!.owedStatus = "NOT_BROUGHT";

    const owed = await storageApi.getMyPendingReturns();
    expect(owed.map((i) => i.id)).toEqual(["f1", `${req.id}-EQ-002`, "f2"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/storage/api/storageApi.test.ts -t "pickup and due dates"`
Expected: FAIL. `pickup` is `undefined` in the first test; the rest fail with `storageApi.setDefaultDueAt is not a function` or similar.

- [ ] **Step 3: Implement**

In `src/features/storage/api/storageApi.ts`, in `confirmBorrow` rename the parameter `_pickup` to `pickup`, and add right before `req!.status = "READY_FOR_PICKUP";`:

```ts
    req!.pickup = { ...pickup };
```

Add these entries to the `storageApi` object (after `cancelBorrow`):

```ts
  /**
   * A group member (or staff) confirms the items were collected. The request closes, gets
   * the default due date, and every issued unit / bulk line becomes owed by the group.
   */
  confirmPickup: async (id: string): Promise<BorrowRequest> => {
    const req = borrowRequests.find((r) => r.id === id);
    if (!req) return fail("ไม่พบคำขอ");
    if (req!.status !== "READY_FOR_PICKUP") return fail("คำขอนี้ยังไม่พร้อมให้รับของ");
    req!.status = "CLOSED";
    req!.pickedUpAt = clock.now();
    req!.dueAt = settings.defaultDueAt;
    const base = {
      requestId: req!.id,
      groupId: req!.groupId,
      group: req!.group,
      dueAt: req!.dueAt,
      owedStatus: "OWED" as const,
    };
    for (const line of req!.items) {
      if (line.issuedQty <= 0) continue;
      if (line.isUnique) {
        for (const u of units.filter((x) => x.requestId === req!.id && x.itemId === line.itemId && x.status === "OUT")) {
          pendingReturns.push({
            ...base, id: `${req!.id}-${u.serial}`, itemId: line.itemId, name: line.name, isUnique: true, qty: 1, serialNumber: u.serial,
          });
        }
      } else {
        pendingReturns.push({
          ...base, id: `${req!.id}-${line.itemId}`, itemId: line.itemId, name: line.name, isUnique: false, qty: line.issuedQty,
        });
      }
    }
    return delay(req!);
  },

  /** Owed items of all the current student's groups. */
  getMyPendingReturns: async (): Promise<PendingReturnItem[]> =>
    delay(sortOwed(owedFor(session.studentId), clock.now())),

  getDefaultDueAt: async (): Promise<number> => delay(settings.defaultDueAt),

  /** Applies to future pickups only. */
  setDefaultDueAt: async (at: number): Promise<number> => {
    if (!Number.isFinite(at) || at <= clock.now()) return fail("กำหนดคืนต้องเป็นเวลาในอนาคต");
    settings.defaultDueAt = at;
    return delay(at);
  },

  /** Staff extends (or shortens) one request's due date; its owed items follow. */
  setRequestDueAt: async (id: string, at: number): Promise<BorrowRequest> => {
    const req = borrowRequests.find((r) => r.id === id);
    if (!req) return fail("ไม่พบคำขอ");
    if (req!.status !== "CLOSED") return fail("แก้กำหนดคืนได้เฉพาะคำขอที่รับของแล้ว");
    if (!Number.isFinite(at) || at < (req!.pickedUpAt ?? 0)) return fail("กำหนดคืนต้องไม่ก่อนวันที่รับของ");
    req!.dueAt = at;
    for (const i of pendingReturns) if (i.requestId === id) i.dueAt = at;
    return delay(req!);
  },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/features/storage`
Expected: PASS, 30 tests.

- [ ] **Step 5: Commit (only if commits are approved)**

```bash
git add src/features/storage/api/storageApi.ts src/features/storage/api/storageApi.test.ts
git commit -m "feat(storage): store pickup details, confirm pickup and due dates"
```

---

### Task 5: React-query hooks

**Files:**
- Modify: `src/features/storage/api/hooks.ts`

- [ ] **Step 1: Add the keys and hooks**

In `src/features/storage/api/hooks.ts`, replace `storageKeys` with:

```ts
export const storageKeys = {
  all: ["storage"] as const,
  inventory: ["storage", "inventory"] as const,
  borrow: ["storage", "borrow"] as const,
  borrowOne: (id: string) => ["storage", "borrow", id] as const,
  pendingReturns: (studentId: string) => ["storage", "returns", studentId] as const,
  qc: ["storage", "qc"] as const,
  qcOne: (id: string) => ["storage", "qc", id] as const,
  me: ["storage", "me"] as const,
  students: ["storage", "students"] as const,
  myRequests: ["storage", "my-requests"] as const,
  myReturns: ["storage", "my-returns"] as const,
  defaultDueAt: ["storage", "default-due-at"] as const,
};
```

All keys start with `"storage"`, so the existing `useStorageMutation` invalidation refreshes every view after any mutation, including switching the current student.

Append at the end of the file:

```ts
export const useCurrentStudent = () =>
  useQuery({ queryKey: storageKeys.me, queryFn: storageApi.getCurrentStudent });

export const useStudents = () =>
  useQuery({ queryKey: storageKeys.students, queryFn: storageApi.listStudents });

export const useMyRequests = () =>
  useQuery({ queryKey: storageKeys.myRequests, queryFn: storageApi.getMyRequests });

export const useMyPendingReturns = () =>
  useQuery({ queryKey: storageKeys.myReturns, queryFn: storageApi.getMyPendingReturns });

export const useDefaultDueAt = () =>
  useQuery({ queryKey: storageKeys.defaultDueAt, queryFn: storageApi.getDefaultDueAt });

export const useSetCurrentStudent = () =>
  useStorageMutation((studentId: string) => storageApi.setCurrentStudent(studentId));

export const useCreateBorrowRequest = () =>
  useStorageMutation((input: NewBorrowRequest) => storageApi.createBorrowRequest(input));

export const useCancelBorrow = () => useStorageMutation((id: string) => storageApi.cancelBorrow(id));

export const useConfirmPickup = () => useStorageMutation((id: string) => storageApi.confirmPickup(id));

export const useSetDefaultDueAt = () => useStorageMutation((at: number) => storageApi.setDefaultDueAt(at));

export const useSetRequestDueAt = () =>
  useStorageMutation((v: { id: string; at: number }) => storageApi.setRequestDueAt(v.id, v.at));
```

Add `NewBorrowRequest` to the `../types` import list at the top of the file.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit (only if commits are approved)**

```bash
git add src/features/storage/api/hooks.ts
git commit -m "feat(storage): hooks for student requests, pickup and due dates"
```

---

### Task 6: Date helpers

**Files:**
- Create: `src/features/storage/components/dates.ts`
- Test: `src/features/storage/components/dates.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/features/storage/components/dates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DAY_MS, daysBetween, dueTone, formatCountdown, fromLocalInput, spanLabel, toLocalInput } from "./dates";

describe("date helpers", () => {
  it("formats a countdown as hh:mm:ss and never goes negative", () => {
    expect(formatCountdown(23 * 3600_000 + 41 * 60_000 + 5_000)).toBe("23:41:05");
    expect(formatCountdown(-5_000)).toBe("00:00:00");
  });

  it("counts days left, rounding a part day up", () => {
    expect(daysBetween(0, DAY_MS / 2)).toBe(1);
    expect(daysBetween(0, 131 * DAY_MS)).toBe(131);
  });

  it("round-trips a datetime-local value", () => {
    const ms = fromLocalInput("2027-03-31T17:00");
    expect(toLocalInput(ms)).toBe("2027-03-31T17:00");
  });

  it("picks the due tone: late when overdue or not brought, soon within 14 days, ok after", () => {
    const now = 1_000 * DAY_MS;
    expect(dueTone(now - 1, now, false)).toBe("late");
    expect(dueTone(now + 30 * DAY_MS, now, true)).toBe("late");
    expect(dueTone(now + 14 * DAY_MS, now, false)).toBe("soon");
    expect(dueTone(now + 15 * DAY_MS, now, false)).toBe("ok");
  });

  it("describes a span in months when long, days when short", () => {
    expect(spanLabel(120 * DAY_MS)).toBe("4 เดือน");
    expect(spanLabel(10 * DAY_MS)).toBe("10 วัน");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/storage/components/dates.test.ts`
Expected: FAIL, because `./dates` doesn't exist.

- [ ] **Step 3: Implement**

Create `src/features/storage/components/dates.ts`:

```ts
import { useEffect, useState } from "react";

export const DAY_MS = 24 * 60 * 60 * 1000;
/** Due within this many days shows amber. */
export const DUE_SOON_DAYS = 14;

export const formatDateTime = (ms: number) =>
  new Date(ms).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

export const formatDate = (ms: number) => new Date(ms).toLocaleDateString("th-TH", { dateStyle: "medium" });

/** Whole days from `from` to `to`, a part day counted as a day. */
export const daysBetween = (from: number, to: number) => Math.ceil((to - from) / DAY_MS);

/** "23:41:05"; clamps at zero. */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":");
}

/** "4 เดือน" for spans of 60 days or more, otherwise "N วัน". */
export function spanLabel(ms: number): string {
  const days = Math.round(ms / DAY_MS);
  return days >= 60 ? `${Math.round(days / 30)} เดือน` : `${days} วัน`;
}

/** Epoch ms -> value for <input type="datetime-local"> (local time, minutes). */
export function toLocalInput(ms: number): string {
  const offset = new Date(ms).getTimezoneOffset() * 60_000;
  return new Date(ms - offset).toISOString().slice(0, 16);
}

/** <input type="datetime-local"> value -> epoch ms (NaN when empty or invalid). */
export const fromLocalInput = (value: string) => new Date(value).getTime();

export type DueTone = "ok" | "soon" | "late";

export function dueTone(dueAt: number, now: number, notBrought: boolean): DueTone {
  if (notBrought || now > dueAt) return "late";
  return dueAt - now <= DUE_SOON_DAYS * DAY_MS ? "soon" : "ok";
}

/** Current time, refreshed every `intervalMs` (for countdowns and due badges). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/features/storage`
Expected: PASS, 35 tests.

- [ ] **Step 5: Commit (only if commits are approved)**

```bash
git add src/features/storage/components/dates.ts src/features/storage/components/dates.test.ts
git commit -m "feat(storage): date helpers for countdowns and due dates"
```

---

### Task 7: Shared UI pieces (tabs, badges, confirm dialog, pickup card)

**Files:**
- Create: `src/features/storage/components/Tabs.tsx`
- Modify: `src/features/storage/components/badges.tsx`
- Modify: `src/features/storage/components/layout.tsx`
- Create: `src/features/storage/components/PickupCard.tsx`

- [ ] **Step 1: Create `Tabs.tsx`**

```tsx
import { cn } from "@/lib/utils";

export interface TabItem<T extends string> {
  value: T;
  label: string;
  /** Shown as a small badge when greater than zero. */
  count?: number;
}

/** Underline tabs: active tab in brand blue. */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-6 border-b border-neutral-200">
      {items.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-1 pb-2 pt-1 font-body text-body-sm-emphasize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary",
              active ? "border-brand-primary text-brand-primary" : "border-transparent text-grey-400 hover:text-grey-900",
            )}
          >
            {t.label}
            {!!t.count && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] font-bold",
                  active ? "bg-brand-primary text-white" : "bg-grey-100 text-grey-400",
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Extend `badges.tsx`**

In `src/features/storage/components/badges.tsx`:

Change the type import to:

```ts
import type { BorrowRequest, BorrowStatus, QCItemStatus, QCRequestStatus } from "../types";
import { DAY_MS, daysBetween, dueTone, formatDate } from "./dates";
```

Add a `CANCELLED` entry to `TASK_STYLES`:

```ts
  CANCELLED: "border-grey-200 bg-grey-100 text-grey-400",
```

Append to the file:

```tsx
const TONE = {
  info: "border-status-info-border bg-status-info-bg text-status-info-fg",
  success: "border-status-success-border bg-status-success-bg text-status-success-fg",
  warning: "border-status-warning-border bg-status-warning-bg text-status-warning-fg",
  danger: "border-status-danger-border bg-status-danger-bg text-status-danger-fg",
  grey: "border-grey-200 bg-grey-100 text-grey-400",
};

const REQUEST_PILLS: Record<BorrowStatus, { label: string; cls: string }> = {
  OPEN: { label: "รอดำเนินการ", cls: TONE.info },
  READY_FOR_PICKUP: { label: "พร้อมรับ", cls: TONE.success },
  UNFULFILLED: { label: "ของหมด", cls: TONE.warning },
  CANCELLED: { label: "ยกเลิก", cls: TONE.grey },
  CLOSED: { label: "รับของแล้ว", cls: TONE.grey },
};

type PillRequest = Pick<BorrowRequest, "status" | "restock" | "cancelReason">;

export function requestPillLabel(req: PillRequest): string {
  if (req.status === "UNFULFILLED" && req.restock) return "ของหมด · มีของแล้ว";
  if (req.status === "CANCELLED") return req.cancelReason === "RESTOCK_EXPIRED" ? "ยกเลิก · หมดเวลา" : "ยกเลิก · โดยผู้ขอ";
  return REQUEST_PILLS[req.status].label;
}

/** Student-facing request status, in Thai. */
export function RequestStatusPill({ req }: { req: PillRequest }) {
  return (
    <Badge variant="outline" className={cn("px-2 py-0.5 text-[10px] font-bold", REQUEST_PILLS[req.status].cls)}>
      {requestPillLabel(req)}
    </Badge>
  );
}

/** Due date with colour: grey > 14 days, amber <= 14 days, red overdue or not brought. */
export function DueBadge({ dueAt, now, notBrought = false }: { dueAt: number; now: number; notBrought?: boolean }) {
  const tone = dueTone(dueAt, now, notBrought);
  const label =
    now > dueAt
      ? `เลยกำหนด ${Math.max(1, Math.floor((now - dueAt) / DAY_MS))} วัน`
      : notBrought
        ? `${formatDate(dueAt)} · ค้างส่ง`
        : `${formatDate(dueAt)} · อีก ${daysBetween(now, dueAt)} วัน`;
  return (
    <Badge
      variant="outline"
      className={cn(
        "whitespace-nowrap px-2 py-0.5 text-[10px] font-bold",
        tone === "late" ? TONE.danger : tone === "soon" ? TONE.warning : TONE.grey,
      )}
    >
      {label}
    </Badge>
  );
}
```

- [ ] **Step 3: Add `ConfirmDialog` to `layout.tsx`**

Append to `src/features/storage/components/layout.tsx`:

```tsx
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="whitespace-pre-line">{message}</DialogDescription>
        <DialogFooter className="gap-2">
          <Button variant="outlined" size="lg" onClick={onCancel}>
            ย้อนกลับ
          </Button>
          <Button variant="filled" size="lg" loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Create `PickupCard.tsx`**

```tsx
import { MapPin } from "lucide-react";
import type { PickupDetails } from "../types";
import { formatDateTime } from "./dates";

export const LOCATION_LABEL: Record<PickupDetails["location"], string> = {
  locker: "ตู้ Smart Locker",
  counter: "เคาน์เตอร์ภาควิชาฯ",
  lab: "ห้องปฏิบัติการ (Lab)",
};

/** Where and when to collect, as set by staff when issuing. */
export function PickupCard({ pickup }: { pickup: PickupDetails }) {
  return (
    <div className="rounded-lg border border-status-success-border bg-status-success-bg p-4 font-body text-body-sm text-status-success-fg">
      <p className="flex items-center gap-2 font-bold">
        <MapPin className="size-4 shrink-0" aria-hidden="true" />
        รับที่{LOCATION_LABEL[pickup.location]} · {formatDateTime(new Date(pickup.pickupAt).getTime())}
      </p>
      {pickup.remark && <p className="mt-1 text-xs">หมายเหตุ: {pickup.remark}</p>}
    </div>
  );
}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit (only if commits are approved)**

```bash
git add src/features/storage/components/Tabs.tsx src/features/storage/components/badges.tsx src/features/storage/components/layout.tsx src/features/storage/components/PickupCard.tsx
git commit -m "feat(storage): tabs, request and due badges, confirm dialog, pickup card"
```

---

### Task 8: Restock banner and dev student switcher

**Files:**
- Create: `src/features/storage/components/RestockBanner.tsx`
- Create: `src/features/storage/components/DevStudentSwitcher.tsx`

- [ ] **Step 1: Create `RestockBanner.tsx`**

```tsx
import { Button } from "@/components/ui/button";
import { useReopenBorrow } from "../api/hooks";
import type { BorrowRequest } from "../types";
import { formatCountdown, useNow } from "./dates";

/** One row per request whose stock came back, with a live countdown to the hold expiry. */
export function RestockBanner({ requests }: { requests: BorrowRequest[] }) {
  const now = useNow();
  const reopen = useReopenBorrow();
  const flagged = requests.filter((r) => r.status === "UNFULFILLED" && r.restock && r.restock.expiresAt > now);
  if (flagged.length === 0) return null;

  return (
    <div className="space-y-2">
      {flagged.map((r) => (
        <div
          key={r.id}
          role="status"
          className="flex flex-col gap-2 rounded-lg border border-status-warning-border bg-status-warning-bg p-3 font-body text-body-sm text-status-warning-fg sm:flex-row sm:items-center sm:justify-between"
        >
          <p>
            <span className="font-bold">{r.items.map((i) => i.name).join(", ")} มีของแล้ว</span> · {r.id} · เปิดคำขอใหม่ภายใน{" "}
            <span className="font-mono font-bold">{formatCountdown(r.restock!.expiresAt - now)}</span>
          </p>
          <Button
            variant="filled"
            size="small"
            className="shrink-0 px-4"
            loading={reopen.isPending && reopen.variables === r.id}
            onClick={() => reopen.mutate(r.id)}
          >
            เปิดคำขอ
          </Button>
        </div>
      ))}
      {reopen.isError && (
        <p role="alert" className="text-sm text-status-danger-fg">{(reopen.error as Error).message}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `DevStudentSwitcher.tsx`**

```tsx
import { useCurrentStudent, useSetCurrentStudent, useStudents } from "../api/hooks";

/** Dev builds only (the parent checks import.meta.env.DEV): act as any seeded student. */
export function DevStudentSwitcher() {
  const students = useStudents();
  const me = useCurrentStudent();
  const set = useSetCurrentStudent();

  return (
    <label className="flex items-center gap-2 font-body text-body-xs text-grey-400">
      <span className="rounded bg-status-warning-bg px-1.5 py-0.5 font-bold text-status-warning-fg">DEV</span>
      นิสิต
      <select
        value={me.data?.studentId ?? ""}
        onChange={(e) => set.mutate(e.target.value)}
        disabled={set.isPending}
        className="h-8 rounded-md border border-neutral-200 bg-white px-2 text-sm"
      >
        {students.data?.map((s) => (
          <option key={s.studentId} value={s.studentId}>
            {s.studentId} {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit (only if commits are approved)**

```bash
git add src/features/storage/components/RestockBanner.tsx src/features/storage/components/DevStudentSwitcher.tsx
git commit -m "feat(storage): restock banner and dev student switcher"
```

---

### Task 9: Borrow tab (catalog cards and cart)

**Files:**
- Create: `src/features/storage/components/RequestForm.tsx`
- Create: `src/features/storage/routes/CatalogPage.tsx`

- [ ] **Step 1: Create `RequestForm.tsx`**

```tsx
import { TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useCreateBorrowRequest, useCurrentStudent } from "../api/hooks";
import type { InventoryItem } from "../types";
import { ResultDialog } from "./layout";

export function QtyStepper({
  value,
  max,
  onChange,
  label,
}: {
  value: number;
  max: number;
  onChange: (qty: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white">
      <button
        type="button"
        aria-label={`ลด ${label}`}
        className="px-3 py-1 text-grey-700 hover:bg-neutral-100"
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <span className="font-body text-body-sm-emphasize text-grey-900" aria-live="polite">{value}</span>
      <button
        type="button"
        aria-label={`เพิ่ม ${label}`}
        disabled={value >= max}
        className="px-3 py-1 text-grey-700 hover:bg-neutral-100 disabled:opacity-40"
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  );
}

/** Cart column: pick a group (type comes from it), review lines, submit. */
export function RequestForm({
  inventory,
  cart,
  onQtyChange,
  onSubmitted,
}: {
  inventory: InventoryItem[];
  cart: Record<string, number>;
  onQtyChange: (itemId: string, qty: number) => void;
  onSubmitted: (requestId: string) => void;
}) {
  const me = useCurrentStudent();
  const create = useCreateBorrowRequest();
  const [groupId, setGroupId] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const groups = me.data?.groups ?? [];
  const group = groups.find((g) => g.id === groupId) ?? groups[0];
  const lines = Object.entries(cart)
    .map(([itemId, qty]) => ({ item: inventory.find((i) => i.id === itemId), qty }))
    .filter((l): l is { item: InventoryItem; qty: number } => !!l.item);
  const canSubmit = !!group && lines.length > 0 && !create.isPending;

  const submit = () =>
    create.mutate(
      { groupId: group!.id, items: lines.map((l) => ({ itemId: l.item.id, qty: l.qty })) },
      { onSuccess: (req) => setDone(req.id) },
    );

  return (
    <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5 lg:sticky lg:top-6">
      <h2 className="border-b pb-2 font-body text-body-md-emphasize text-grey-900">ตะกร้า</h2>

      <div>
        <label htmlFor="req-group" className="mb-1 block text-xs font-bold text-grey-700">กลุ่ม</label>
        <select
          id="req-group"
          value={group?.id ?? ""}
          onChange={(e) => setGroupId(e.target.value)}
          className="h-9 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm shadow-sm"
        >
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.label}</option>
          ))}
        </select>
        {group && <p className="mt-1 text-xs text-grey-400">ประเภท: {group.type}</p>}
      </div>

      {lines.length === 0 ? (
        <p className="py-6 text-center text-sm text-grey-200">ยังไม่ได้เลือกอุปกรณ์</p>
      ) : (
        <ul className="space-y-3">
          {lines.map(({ item, qty }) => (
            <li key={item.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-grey-900">{item.name}</span>
                <button
                  type="button"
                  aria-label={`เอา ${item.name} ออก`}
                  onClick={() => onQtyChange(item.id, 0)}
                  className="text-grey-200 hover:text-status-danger-fg"
                >
                  <X className="size-4" />
                </button>
              </div>
              <QtyStepper value={qty} max={item.total} onChange={(q) => onQtyChange(item.id, q)} label={item.name} />
              {qty > item.available && (
                <p className="flex items-center gap-1 text-xs text-status-warning-fg">
                  <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                  เกินจำนวนที่ว่าง ({item.available}) · ส่วนที่เกินจะรอคิว
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {create.isError && (
        <p role="alert" className="text-sm text-status-danger-fg">{(create.error as Error).message}</p>
      )}
      <Button variant="filled" size="lg" className="w-full" disabled={!canSubmit} loading={create.isPending} onClick={submit}>
        ส่งคำขอ
      </Button>

      <ResultDialog
        open={done !== null}
        title="ส่งคำขอแล้ว"
        message={`คำขอ ${done} เข้าคิวแล้ว\nเจ้าหน้าที่จะแจ้งเวลานัดรับในแท็บ "คำขอของฉัน"`}
        onClose={() => {
          const id = done!;
          setDone(null);
          onSubmitted(id);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create `CatalogPage.tsx`**

```tsx
import { useState } from "react";
import { EmptyState, SkeletonRow } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useInventory } from "../api/hooks";
import { ItemImage } from "../components/ItemImage";
import { QtyStepper, RequestForm } from "../components/RequestForm";
import type { InventoryItem } from "../types";

function CatalogCard({ item, qty, onChange }: { item: InventoryItem; qty: number; onChange: (qty: number) => void }) {
  const soldOut = item.available === 0;
  return (
    <div className="flex h-full flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-3">
      <ItemImage src={item.imageUrl} name={item.name} className="h-28 w-full" />
      <div className="flex-1">
        <p className="font-body text-body-sm-emphasize text-grey-900">{item.name}</p>
        <p className="font-mono text-xs text-grey-400">{item.id}</p>
      </div>
      <p className={cn("text-xs font-bold", soldOut ? "text-status-warning-fg" : "text-status-success-fg")}>
        {soldOut ? "หมด · ต่อคิวได้" : `ว่าง ${item.available}`}
      </p>
      {qty === 0 ? (
        <Button variant="outlined" size="small" className="w-full px-0" onClick={() => onChange(1)}>
          + เพิ่ม
        </Button>
      ) : (
        <QtyStepper value={qty} max={item.total} onChange={onChange} label={item.name} />
      )}
    </div>
  );
}

/** Borrow tab: picture-card catalog with the cart column on the right. */
export function CatalogPage({ onSubmitted }: { onSubmitted: (requestId: string) => void }) {
  const inventory = useInventory();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});

  const all = inventory.data ?? [];
  const q = search.trim().toLowerCase();
  const items = all.filter((i) => !q || i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q));

  const setQty = (itemId: string, qty: number) => {
    const item = all.find((i) => i.id === itemId);
    if (!item) return;
    setCart((c) => {
      const next = { ...c };
      if (qty <= 0) delete next[itemId];
      else next[itemId] = Math.min(qty, item.total);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <section className="min-w-0 flex-1 space-y-4">
        <Input
          type="search"
          aria-label="ค้นหาอุปกรณ์"
          placeholder="ค้นหาอุปกรณ์ (ชื่อหรือรหัส)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {inventory.isLoading && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => <SkeletonRow key={i} className="h-56" />)}
          </div>
        )}
        {inventory.isError && <EmptyState title="โหลดรายการอุปกรณ์ไม่สำเร็จ" />}
        {inventory.data && items.length === 0 && <EmptyState title="ไม่พบอุปกรณ์" />}
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <li key={item.id}>
              <CatalogCard item={item} qty={cart[item.id] ?? 0} onChange={(qty) => setQty(item.id, qty)} />
            </li>
          ))}
        </ul>
      </section>
      <aside className="lg:w-80">
        <RequestForm
          inventory={all}
          cart={cart}
          onQtyChange={setQty}
          onSubmitted={(id) => {
            setCart({});
            onSubmitted(id);
          }}
        />
      </aside>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit (only if commits are approved)**

```bash
git add src/features/storage/components/RequestForm.tsx src/features/storage/routes/CatalogPage.tsx
git commit -m "feat(storage): student catalog and cart"
```

---

### Task 10: Requests tab (list and detail side by side)

**Files:**
- Create: `src/features/storage/routes/MyRequestsPage.tsx`

- [ ] **Step 1: Create `MyRequestsPage.tsx`**

```tsx
import { useState } from "react";
import { EmptyState, SkeletonRow } from "@/components/states";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCancelBorrow, useConfirmPickup, useReopenBorrow } from "../api/hooks";
import { DueBadge, RequestStatusPill } from "../components/badges";
import { formatCountdown, formatDate, formatDateTime, useNow } from "../components/dates";
import { ItemImage } from "../components/ItemImage";
import { ConfirmDialog } from "../components/layout";
import { PickupCard } from "../components/PickupCard";
import type { BorrowRequest } from "../types";

function RestockAction({ req }: { req: BorrowRequest }) {
  const now = useNow();
  const reopen = useReopenBorrow();
  return (
    <div className="w-full space-y-2 rounded-lg border border-status-warning-border bg-status-warning-bg p-3 font-body text-body-sm text-status-warning-fg">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span>
          มีของแล้ว · เปิดคำขอภายใน{" "}
          <span className="font-mono font-bold">{formatCountdown(req.restock!.expiresAt - now)}</span>
        </span>
        <Button variant="filled" size="small" className="px-4" loading={reopen.isPending} onClick={() => reopen.mutate(req.id)}>
          เปิดคำขอ
        </Button>
      </div>
      {reopen.isError && <p role="alert" className="text-status-danger-fg">{(reopen.error as Error).message}</p>}
    </div>
  );
}

function RequestDetail({ req }: { req: BorrowRequest }) {
  const now = useNow(60_000);
  const pickup = useConfirmPickup();
  const cancel = useCancelBorrow();
  const [confirming, setConfirming] = useState<null | "pickup" | "cancel">(null);

  const issued = req.status === "READY_FOR_PICKUP" || req.status === "CLOSED";
  const canCancel = req.status === "OPEN" || req.status === "UNFULFILLED";
  const error = (pickup.error ?? cancel.error) as Error | null;

  return (
    <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-body text-body-md-emphasize text-grey-900">{req.id}</h2>
          <p className="mt-1 text-xs text-grey-400">
            {req.group} · {req.type} · ส่งโดย {req.user} · {formatDateTime(req.createdAt)}
          </p>
        </div>
        <RequestStatusPill req={req} />
      </div>

      {req.status === "READY_FOR_PICKUP" && req.pickup && <PickupCard pickup={req.pickup} />}

      {req.status === "CLOSED" && req.dueAt && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-grey-700">
          รับของเมื่อ {req.pickedUpAt ? formatDate(req.pickedUpAt) : "-"} · กำหนดคืน <DueBadge dueAt={req.dueAt} now={now} />
        </p>
      )}

      <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
        {req.items.map((it) => (
          <li key={it.itemId} className="flex items-center gap-3 p-3">
            <ItemImage itemId={it.itemId} name={it.name} className="size-10" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-grey-900">{it.name}</span>
              {issued && !!it.issuedSerials?.length && (
                <span className="block font-mono text-xs text-grey-400">{it.issuedSerials.join(", ")}</span>
              )}
            </span>
            <span className="whitespace-nowrap text-sm text-grey-700">
              {issued ? `ได้ ${it.issuedQty}/${it.reqQty}` : `ขอ ${it.reqQty}`}
            </span>
          </li>
        ))}
      </ul>

      {req.status === "UNFULFILLED" && req.restock && <RestockAction req={req} />}

      {(req.status === "READY_FOR_PICKUP" || canCancel) && (
        <div className="flex flex-wrap gap-3">
          {req.status === "READY_FOR_PICKUP" && (
            <Button variant="filled" size="lg" onClick={() => setConfirming("pickup")}>รับของแล้ว</Button>
          )}
          {canCancel && (
            <Button variant="outlined" size="lg" onClick={() => setConfirming("cancel")}>ยกเลิกคำขอ</Button>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-status-danger-fg">{error.message}</p>}

      <ConfirmDialog
        open={confirming === "pickup"}
        title="ยืนยันว่ารับของแล้ว"
        message="อุปกรณ์จะย้ายไปอยู่ในรายการที่ต้องคืนของกลุ่ม"
        confirmLabel="ยืนยันรับของ"
        loading={pickup.isPending}
        onCancel={() => setConfirming(null)}
        onConfirm={() => pickup.mutate(req.id, { onSettled: () => setConfirming(null) })}
      />
      <ConfirmDialog
        open={confirming === "cancel"}
        title="ยกเลิกคำขอนี้?"
        message={"ยกเลิกแล้วกู้คืนไม่ได้\nถ้าต้องการยืมใหม่ ต้องส่งคำขอใหม่และต่อคิวท้ายสุด"}
        confirmLabel="ยกเลิกคำขอ"
        loading={cancel.isPending}
        onCancel={() => setConfirming(null)}
        onConfirm={() => cancel.mutate(req.id, { onSettled: () => setConfirming(null) })}
      />
    </div>
  );
}

/** Requests tab: list on the left, the selected request's detail on the right. */
export function MyRequestsPage({
  requests,
  isLoading,
  isError,
  selectedId,
  onSelect,
}: {
  requests: BorrowRequest[];
  isLoading: boolean;
  isError: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (isLoading) return <div className="space-y-2">{Array.from({ length: 3 }, (_, i) => <SkeletonRow key={i} className="h-16" />)}</div>;
  if (isError) return <EmptyState title="โหลดคำขอไม่สำเร็จ" />;
  if (requests.length === 0) return <EmptyState title='ยังไม่มีคำขอ เลือกอุปกรณ์ได้ในแท็บ "ยืมอุปกรณ์"' />;

  const selected = requests.find((r) => r.id === selectedId) ?? requests[0];

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <ul className="space-y-2 lg:w-5/12" aria-label="รายการคำขอ">
        {requests.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onSelect(r.id)}
              aria-current={r.id === selected.id ? "true" : undefined}
              className={cn(
                "w-full rounded-xl border bg-white p-4 text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary",
                r.id === selected.id ? "border-brand-primary ring-1 ring-brand-primary" : "border-neutral-200",
              )}
            >
              <span className="flex items-center gap-2">
                <span className="font-body text-body-sm-emphasize text-grey-900">{r.id}</span>
                <RequestStatusPill req={r} />
              </span>
              <span className="mt-1 block truncate text-xs text-grey-400">
                {r.group} · {r.items.map((i) => `${i.name} ×${i.reqQty}`).join(", ")}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <section className="min-w-0 flex-1">
        <RequestDetail key={selected.id} req={selected} />
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit (only if commits are approved)**

```bash
git add src/features/storage/routes/MyRequestsPage.tsx
git commit -m "feat(storage): student requests list and detail"
```

---

### Task 11: To-return tab (owed items table)

**Files:**
- Create: `src/features/storage/routes/OwedPage.tsx`

- [ ] **Step 1: Create `OwedPage.tsx`**

```tsx
import { useState } from "react";
import { EmptyState, SkeletonRow } from "@/components/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCurrentStudent, useMyPendingReturns } from "../api/hooks";
import { DueBadge } from "../components/badges";
import { useNow } from "../components/dates";
import { ItemImage } from "../components/ItemImage";
import { itemLabel } from "../components/itemLabel";

/** To-return tab: everything my groups hold, read-only in phase 1. */
export function OwedPage() {
  const owed = useMyPendingReturns();
  const me = useCurrentStudent();
  const now = useNow(60_000);
  const [groupId, setGroupId] = useState("all");

  const rows = (owed.data ?? []).filter((i) => groupId === "all" || i.groupId === groupId);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <label htmlFor="owed-group" className="text-sm font-semibold text-grey-700">กลุ่ม</label>
        <select
          id="owed-group"
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          className="h-9 rounded-md border border-neutral-200 bg-white px-3 text-sm shadow-sm"
        >
          <option value="all">ทั้งหมด</option>
          {me.data?.groups.map((g) => (
            <option key={g.id} value={g.id}>{g.label}</option>
          ))}
        </select>
      </div>

      {owed.isLoading && <div className="space-y-2">{Array.from({ length: 3 }, (_, i) => <SkeletonRow key={i} className="h-12" />)}</div>}
      {owed.isError && <EmptyState title="โหลดรายการไม่สำเร็จ" />}
      {owed.data && rows.length === 0 && <EmptyState title="ไม่มีอุปกรณ์ที่ต้องคืน" />}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>อุปกรณ์</TableHead>
                <TableHead>กลุ่ม</TableHead>
                <TableHead>คำขอ</TableHead>
                <TableHead>กำหนดคืน</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    <span className="flex items-center gap-3">
                      <ItemImage itemId={i.itemId} name={i.name} className="size-10" />
                      <span>
                        <span className="block font-semibold text-grey-900">{itemLabel(i)}</span>
                        {i.owedStatus === "NOT_BROUGHT" && (
                          <span className="mt-1 inline-block rounded bg-status-danger-bg px-1.5 text-[10px] font-bold text-status-danger-fg">
                            ยังไม่ได้นำมาคืน
                          </span>
                        )}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="text-grey-700">{i.group}</TableCell>
                  <TableCell className="font-mono text-grey-400">{i.requestId}</TableCell>
                  <TableCell>
                    <DueBadge dueAt={i.dueAt} now={now} notBrought={i.owedStatus === "NOT_BROUGHT"} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit (only if commits are approved)**

```bash
git add src/features/storage/routes/OwedPage.tsx
git commit -m "feat(storage): student owed items table"
```

---

### Task 12: Student hub, route and sidebar

**Files:**
- Create: `src/features/storage/routes/StudentStoragePage.tsx`
- Modify: `src/app/router.tsx`
- Modify: `src/features/student/layout/StudentLayout.tsx`

- [ ] **Step 1: Create `StudentStoragePage.tsx`**

```tsx
import { useSearchParams } from "react-router-dom";
import { useMyPendingReturns, useMyRequests } from "../api/hooks";
import { DevStudentSwitcher } from "../components/DevStudentSwitcher";
import { StoragePage } from "../components/layout";
import { RestockBanner } from "../components/RestockBanner";
import { Tabs } from "../components/Tabs";
import { CatalogPage } from "./CatalogPage";
import { MyRequestsPage } from "./MyRequestsPage";
import { OwedPage } from "./OwedPage";

const TABS = ["borrow", "requests", "owed"] as const;
type TabValue = (typeof TABS)[number];

/** /student/storage?tab=borrow|requests|owed&id=<requestId> */
export function StudentStoragePage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: TabValue = TABS.includes(raw as TabValue) ? (raw as TabValue) : "borrow";
  const selectedId = params.get("id");

  const requests = useMyRequests();
  const owed = useMyPendingReturns();

  const go = (next: TabValue, id?: string) => setParams(id ? { tab: next, id } : { tab: next });
  const needsAttention = (requests.data ?? []).filter(
    (r) => r.status === "READY_FOR_PICKUP" || (r.status === "UNFULFILLED" && !!r.restock),
  ).length;

  return (
    <StoragePage wide title="คลังอุปกรณ์" subtitle="ยืมอุปกรณ์ ติดตามคำขอ และดูรายการที่ต้องคืน">
      {import.meta.env.DEV && (
        <div className="flex justify-end">
          <DevStudentSwitcher />
        </div>
      )}
      <RestockBanner requests={requests.data ?? []} />
      <Tabs
        label="เมนูคลังอุปกรณ์"
        value={tab}
        onChange={(v) => go(v)}
        items={[
          { value: "borrow", label: "ยืมอุปกรณ์" },
          { value: "requests", label: "คำขอของฉัน", count: needsAttention },
          { value: "owed", label: "ที่ต้องคืน", count: owed.data?.length },
        ]}
      />
      {tab === "borrow" && <CatalogPage onSubmitted={(id) => go("requests", id)} />}
      {tab === "requests" && (
        <MyRequestsPage
          requests={requests.data ?? []}
          isLoading={requests.isLoading}
          isError={requests.isError}
          selectedId={selectedId}
          onSelect={(id) => go("requests", id)}
        />
      )}
      {tab === "owed" && <OwedPage />}
    </StoragePage>
  );
}
```

- [ ] **Step 2: Add the route**

In `src/app/router.tsx`, after the `QCDetailPage` lazy import, add:

```tsx
const StudentStoragePage = lazy(() =>
  import("@/features/storage/routes/StudentStoragePage").then((module) => ({
    default: module.StudentStoragePage,
  })),
);
```

Inside the `<Route element={<StudentLayout />}>` block, right before `<Route path="*" element={<NotFound />} />`, add:

```tsx
          {/* Student storage. No RequireAuth yet: student auth is not decided (mock identity). */}
          <Route path="student/storage" element={<StudentStoragePage />} />
```

- [ ] **Step 3: Add the sidebar item**

Replace `src/features/student/layout/StudentLayout.tsx` with:

```tsx
import { CpuChipIcon } from "@heroicons/react/24/outline";
import { useLocation } from "react-router-dom";
import { AppShell } from "@/app/AppShell";
import type { SidebarItem } from "@/components/Sidebar";

const STUDENT_SIDEBAR_ITEMS: SidebarItem[] = [
  { label: "คลังอุปกรณ์", icon: <CpuChipIcon />, to: "/student/storage" },
];

export function StudentLayout() {
  const { pathname } = useLocation();
  const items = STUDENT_SIDEBAR_ITEMS.map((item) => ({
    ...item,
    active: item.to ? pathname.startsWith(item.to) : false,
  }));

  return <AppShell sidebarItems={items} />;
}
```

- [ ] **Step 4: Typecheck and look at it**

Run: `npm run typecheck`
Expected: no errors.

Run `npm run dev` in the background and open `http://localhost:5173/student/storage` (use the port Vite prints).

Expected:
- The sidebar shows "คลังอุปกรณ์" as active.
- The DEV switcher shows `6632199921 นาย ภาคภูมิ`.
- The borrow tab shows 4 picture cards.
- "คำขอของฉัน" lists REQ-B-101 and REQ-B-100.
- "ที่ต้องคืน" shows 2 rows due 31 มี.ค. 2570.

- [ ] **Step 5: Commit (only if commits are approved)**

```bash
git add src/features/storage/routes/StudentStoragePage.tsx src/app/router.tsx src/features/student/layout/StudentLayout.tsx
git commit -m "feat(storage): student storage hub page and route"
```

---

### Task 13: Staff default due date on the dashboard

**Files:**
- Create: `src/features/storage/components/DefaultDueDateField.tsx`
- Modify: `src/features/storage/routes/StorageDashboardPage.tsx`

- [ ] **Step 1: Create `DefaultDueDateField.tsx`**

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDefaultDueAt, useSetDefaultDueAt } from "../api/hooks";
import { fromLocalInput, spanLabel, toLocalInput, useNow } from "./dates";

/** Staff: the due date copied onto each request at pickup. */
export function DefaultDueDateField() {
  const due = useDefaultDueAt();
  const save = useSetDefaultDueAt();
  const now = useNow(60_000);
  const [draft, setDraft] = useState<string | null>(null);

  const value = draft ?? (due.data !== undefined ? toLocalInput(due.data) : "");
  const parsed = value ? fromLocalInput(value) : NaN;
  const dirty = draft !== null && Number.isFinite(parsed) && parsed !== due.data;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-5 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label htmlFor="default-due" className="mb-1 block font-body text-body-sm-emphasize text-grey-900">
          กำหนดคืนเริ่มต้น
        </label>
        <Input
          id="default-due"
          type="datetime-local"
          value={value}
          onChange={(e) => setDraft(e.target.value)}
          className="max-w-xs"
        />
        <p className="mt-1 text-xs text-grey-400">
          {Number.isFinite(parsed) && parsed > now && `≈ ${spanLabel(parsed - now)}จากวันนี้ · `}
          ใช้กับการรับของครั้งถัดไป คำขอที่รับของไปแล้วไม่เปลี่ยน
        </p>
        {save.isError && <p role="alert" className="mt-1 text-sm text-status-danger-fg">{(save.error as Error).message}</p>}
      </div>
      <Button
        variant="filled"
        size="lg"
        disabled={!dirty}
        loading={save.isPending}
        onClick={() => save.mutate(parsed, { onSuccess: () => setDraft(null) })}
      >
        บันทึก
      </Button>
    </section>
  );
}
```

- [ ] **Step 2: Put it on the dashboard**

In `src/features/storage/routes/StorageDashboardPage.tsx`, add the import:

```tsx
import { DefaultDueDateField } from "../components/DefaultDueDateField";
```

and insert `<DefaultDueDateField />` between the closing `</div>` of the action-card grid and the `<div className="flex items-center justify-between">` that holds "รายการอุปกรณ์ในคลัง".

- [ ] **Step 3: Typecheck and look at it**

Run: `npm run typecheck`
Expected: no errors.

Open `/admin/storage`. Expected: the field shows 31 Mar 2027 17:00 (the input format follows the browser locale) with "≈ N เดือนจากวันนี้". Changing the date enables "บันทึก"; saving disables it again.

- [ ] **Step 4: Commit (only if commits are approved)**

```bash
git add src/features/storage/components/DefaultDueDateField.tsx src/features/storage/routes/StorageDashboardPage.tsx
git commit -m "feat(storage): staff default due date setting"
```

---

### Task 14: Staff borrow detail (pickup, confirm pickup, due editor)

**Files:**
- Create: `src/features/storage/components/DueDateEditor.tsx`
- Modify: `src/features/storage/routes/BorrowDetailPage.tsx`

- [ ] **Step 1: Create `DueDateEditor.tsx`**

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSetRequestDueAt } from "../api/hooks";
import type { BorrowRequest } from "../types";
import { daysBetween, formatDate, fromLocalInput, toLocalInput } from "./dates";

/** Staff: extend or shorten one closed request's due date; the loan span updates as you type. */
export function DueDateEditor({ req }: { req: BorrowRequest }) {
  const save = useSetRequestDueAt();
  const [draft, setDraft] = useState<string | null>(null);

  const value = draft ?? (req.dueAt ? toLocalInput(req.dueAt) : "");
  const parsed = value ? fromLocalInput(value) : NaN;
  const dirty = draft !== null && Number.isFinite(parsed) && parsed !== req.dueAt;

  return (
    <div className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <label htmlFor="req-due" className="block text-xs font-bold text-grey-700">กำหนดคืน</label>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          id="req-due"
          type="datetime-local"
          value={value}
          min={req.pickedUpAt ? toLocalInput(req.pickedUpAt) : undefined}
          onChange={(e) => setDraft(e.target.value)}
          className="max-w-xs"
        />
        {req.pickedUpAt && Number.isFinite(parsed) && (
          <span className="text-sm text-grey-400">
            ยืม {daysBetween(req.pickedUpAt, parsed)} วัน (รับของ {formatDate(req.pickedUpAt)})
          </span>
        )}
        <Button
          variant="filled"
          size="small"
          className="px-4"
          disabled={!dirty}
          loading={save.isPending}
          onClick={() => save.mutate({ id: req.id, at: parsed }, { onSuccess: () => setDraft(null) })}
        >
          บันทึก
        </Button>
      </div>
      {save.isError && <p role="alert" className="text-sm text-status-danger-fg">{(save.error as Error).message}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Update `BorrowDetailPage.tsx`**

Change the hooks import to:

```tsx
import { useBorrowRequest, useConfirmBorrow, useConfirmPickup, useReopenBorrow } from "../api/hooks";
```

and add:

```tsx
import { DueDateEditor } from "../components/DueDateEditor";
import { PickupCard } from "../components/PickupCard";
```

In `Workspace`, after `const reopen = useReopenBorrow();` add:

```tsx
  const confirmPickup = useConfirmPickup();
```

In `readOnlyLines`, change the `qty` line to:

```tsx
    qty: req.status === "UNFULFILLED" || req.status === "CANCELLED" ? 0 : it.issuedQty,
```

Replace the read-only message `<p>` (the one with the `UNFULFILLED` ternary) with:

```tsx
                  <p className={req.status === "UNFULFILLED" || req.status === "CANCELLED" ? "font-bold text-status-danger-fg" : ""}>
                    {req.status === "UNFULFILLED"
                      ? "คำขอนี้ถูกยกเลิกเนื่องจากอุปกรณ์ในคลังไม่เพียงพอ (UNFULFILLED) - Read-only View"
                      : req.status === "CANCELLED"
                        ? `คำขอนี้ถูกยกเลิก (${req.cancelReason === "RESTOCK_EXPIRED" ? "หมดเวลาเปิดคำขอ" : "ผู้ขอยกเลิก"}) - Read-only View`
                        : "รายการนี้ถูกจัดการเรียบร้อยแล้ว (Read-only View)"}
                  </p>
```

Right after that read-only message block (the `readOnly ? (...) : (...)` ternary that ends with the info box), and before the `{readOnly ? (<ul ...` lines block, insert:

```tsx
              {(req.status === "READY_FOR_PICKUP" || req.status === "CLOSED") && req.pickup && <PickupCard pickup={req.pickup} />}
              {req.status === "READY_FOR_PICKUP" && (
                <div className="space-y-2">
                  <Button variant="filled" size="lg" loading={confirmPickup.isPending} onClick={() => confirmPickup.mutate(req.id)}>
                    ยืนยันรับของแล้ว
                  </Button>
                  {confirmPickup.isError && (
                    <p role="alert" className="text-sm text-status-danger-fg">{(confirmPickup.error as Error).message}</p>
                  )}
                </div>
              )}
              {req.status === "CLOSED" && <DueDateEditor req={req} />}
```

- [ ] **Step 3: Typecheck and look at it**

Run: `npm run typecheck`
Expected: no errors.

Open `/admin/storage/borrow/REQ-B-100`. Expected: the counter pickup card and a due editor set to 31 Mar 2027 17:00 with "ยืม 151 วัน (รับของ 1 พ.ย. 2569)". The seed pickup is 2026-11-01 09:00, so the span is 150 days 8 hours, rounded up.

- [ ] **Step 4: Commit (only if commits are approved)**

```bash
git add src/features/storage/components/DueDateEditor.tsx src/features/storage/routes/BorrowDetailPage.tsx
git commit -m "feat(storage): staff pickup confirmation and due date editor"
```

---

### Task 15: Staff borrow list and return rows

**Files:**
- Modify: `src/features/storage/routes/BorrowListPage.tsx`
- Modify: `src/features/storage/components/ReturnItemRow.tsx`

- [ ] **Step 1: Hide cancelled requests behind a toggle**

In `src/features/storage/routes/BorrowListPage.tsx`, add `import { useState } from "react";` and, at the top of `BorrowListPage`:

```tsx
  const [showCancelled, setShowCancelled] = useState(false);
  const rows = data?.filter((r) => showCancelled || r.status !== "CANCELLED");
```

Replace the `<div className="flex justify-end">...</div>` block with:

```tsx
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 font-body text-body-sm text-grey-700">
          <input
            type="checkbox"
            checked={showCancelled}
            onChange={(e) => setShowCancelled(e.target.checked)}
            className="size-4 accent-brand-primary"
          />
          แสดงที่ยกเลิก
        </label>
        <Button asChild variant="outlined" size="medium">
          <Link to="/admin/storage/borrow/walk-in">จ่ายหน้าเคาน์เตอร์ (Walk-in)</Link>
        </Button>
      </div>
```

Change `{data?.length === 0 && ...}` to `{rows?.length === 0 && ...}` and `{data?.map((r) => (` to `{rows?.map((r) => (`.

After `<TaskStatusBadge status={r.status} />` add:

```tsx
                {r.status === "CANCELLED" && (
                  <span className="text-xs text-grey-400">
                    {r.cancelReason === "RESTOCK_EXPIRED" ? "หมดเวลาเปิดคำขอ" : "ผู้ขอยกเลิก"}
                  </span>
                )}
```

- [ ] **Step 2: Show request, group and due date on return rows**

In `src/features/storage/components/ReturnItemRow.tsx`, add the import:

```tsx
import { formatDate } from "./dates";
```

Right after the closing `</p>` of the label line (`{itemLabel(item)} <IndexTypeBadge ... />`), add:

```tsx
          <p className="mt-1 font-body text-body-xs text-grey-400">
            {item.requestId} · {item.group} · กำหนดคืน {formatDate(item.dueAt)}
          </p>
```

- [ ] **Step 3: Typecheck and run all tests**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: all test files pass (storage: 35 tests).

- [ ] **Step 4: Commit (only if commits are approved)**

```bash
git add src/features/storage/routes/BorrowListPage.tsx src/features/storage/components/ReturnItemRow.tsx
git commit -m "feat(storage): cancelled filter on staff list, due info on return rows"
```

---

### Task 16: End-to-end check

**Files:** none changed.

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 2: Manual walk-through on the shared mock (one browser tab)**

With `npm run dev` running:

1. `/student/storage` as `6632199921`: add Servo × 2 and Raspberry Pi × 6, pick Group 09, and submit.
   - Pi × 6 shows "⚠ เกินจำนวนที่ว่าง (5)".
   - A success dialog opens, then the requests tab shows the new request (REQ-B-105, OPEN) selected.
2. `/admin/storage/borrow/REQ-B-105`: issue 2 servos with a counter pickup time and remark, then confirm.
3. Back on `/student/storage?tab=requests&id=REQ-B-105`:
   - The pill is "พร้อมรับ", the green pickup card shows the counter, time and remark, and serials are listed.
   - The tab badge shows 1.
4. Click "รับของแล้ว" and confirm. The pill becomes "รับของแล้ว" with a due badge. "ที่ต้องคืน" now lists 2 servos for Group 09 due on the default date.
5. Switch the DEV student to `6632199925`. The same request and owed rows appear, because both students are in Group 09.
6. `/admin/storage/borrow/REQ-B-105`: move the due date to 10 days from now and save. On the student "ที่ต้องคืน" tab, the servo rows turn amber.
7. Cancel REQ-B-101 from the student side. `/admin/storage/borrow` hides it until "แสดงที่ยกเลิก" is ticked, then shows "CANCELLED · ผู้ขอยกเลิก".
8. Restock flow:
   - Walk-in check out all 5 Pis and 42 breadboards (REQ-B-101 must be OPEN for this; reload to reset first).
   - Submit QC REQ-R-201 with all items available.
   - The student banner shows "… มีของแล้ว · REQ-B-101" with a countdown, and "เปิดคำขอ" reopens it.

- [ ] **Step 3: Report**

Report what passed. Report every step that didn't behave as written, with what happened instead.
