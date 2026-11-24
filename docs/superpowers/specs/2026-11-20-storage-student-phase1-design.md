# Storage: Student Side, Phase 1 (Borrow Lifecycle): Design

Date: 2026-11-20
Branch: `feature/storage`
Code: `prototype-1/frontend/src/features/storage/`

## 1. Context and scope

The staff side of storage (`/admin/storage/*`) is built on an in-memory mock API. The student side has
no storage pages yet. This spec covers **phase 1**: the borrow lifecycle for students.

| # | Use case | In phase 1 |
|---|---|---|
| 1 | Browse catalog and stock | yes |
| 2 | Create a borrow request | yes |
| 3 | Track request status and see pickup details | yes |
| 4 | "Stock is back" notice and reopen within 24 h | yes |
| 5 | See what my groups owe, with due dates | yes (read-only) |
| 6 | Drop-and-Go return | phase 2 |
| 7 | Fine payment (PromptPay QR and slip upload) | phase 2 |
| 8 | Notifications outside the app | phase 2 |

Phase 1 also adds small staff-side pieces the student flow needs: due-date settings, stored pickup
details, and staff pickup confirmation.

## 2. Decisions

1. **Actor model.** Any member of a group can create, cancel, reopen and confirm pickup for that
   group's requests. The group owns the request and what it owes.
2. **Runtime.** Extend the existing shared mock (`storageApi.ts`, `mockStore.ts`). Staff and student
   pages share its state in one browser tab. A real backend replaces `storageApi.ts` later.
3. **Student identity.** A mock "current student" (seed `6632199921`), behind
   `getCurrentStudent()`. A dev-only switcher changes it. Real student auth is out of scope.
4. **Quantities.** A line may ask for 1 to the item's `total`. Lines above the current `available`
   are allowed with a "will wait in the queue" warning.
5. **Group and type.** The student picks a group only. `type` comes from the group
   (`StudentGroup.type`). Every student has a built-in Personal group.
6. **After submit.** A request can be cancelled while `OPEN` or `UNFULFILLED`. There's no editing:
   to change it, cancel and resubmit, which goes to the back of the queue. Once it's `READY_FOR_PICKUP`,
   only staff act on it.
7. **Pickup.** A group member taps "I've picked it up" (`READY_FOR_PICKUP -> CLOSED`). Staff have the
   same action as a fallback for counter and lab pickups. Issued items become owed at that moment.
8. **Restock expiry.** If an `UNFULFILLED` request isn't reopened within its 24 h reservation window,
   it is **cancelled automatically** (`cancelReason: "RESTOCK_EXPIRED"`).
9. **Due date per request.** At pickup, `dueAt` is copied from a staff-set default (the semester due
   date). Staff can edit `dueAt` on one request, and the UI shows the span from pickup. Changing the
   default affects only future pickups.
10. **Notices.** In phase 1 the restock notice appears inside the app only.

## 3. Structure

Flat `features/storage/`. No existing file moves.

```
features/storage/
  api/          storageApi.ts, mockStore.ts, stockLogic.ts, hooks.ts, storageApi.test.ts   (extended)
  types/        index.ts                                                                  (extended)
  components/   existing, plus: Tabs.tsx, RequestForm.tsx, RestockBanner.tsx, PickupCard.tsx,
                DevStudentSwitcher.tsx; DueBadge added to badges.tsx
  routes/       existing staff pages, plus: StudentStoragePage.tsx (hub), CatalogPage.tsx,
                MyRequestsPage.tsx, OwedPage.tsx
```

Naming: no `Student` prefix on components or tab pages. In this codebase "Borrow…" pages are staff
pages and "Request…" components are student ones.

Routing: `/student/storage` renders `StudentStoragePage` inside `StudentLayout`, which gets one
sidebar item "คลังอุปกรณ์". Staff routes stay at `/admin/storage/*`.

## 4. Data model changes (`types/index.ts`)

```ts
export type BorrowStatus = "OPEN" | "READY_FOR_PICKUP" | "CLOSED" | "UNFULFILLED" | "CANCELLED";

export interface StudentGroup {
  id: string;
  label: string;
  type: string;            // NEW: "Course - IoT System" | "Custom" | "Personal" ...
}

export interface BorrowRequest {
  // existing: id, type, group, user, studentId, status, createdAt, restock?, items
  groupId: string;                                  // NEW: ownership key (labels are not unique)
  cancelReason?: "BY_STUDENT" | "RESTOCK_EXPIRED";  // NEW, set when CANCELLED
  pickup?: PickupDetails;                           // NEW: stored by confirmBorrow
  pickedUpAt?: number;                              // NEW: epoch ms, set by confirmPickup
  dueAt?: number;                                   // NEW: epoch ms, set at pickup, staff-editable
}

export interface PendingReturnItem {
  // existing fields unchanged
  requestId: string;       // NEW
  groupId: string;         // NEW
  group: string;           // NEW: label for display
  dueAt: number;           // NEW: copied from the request; follows setRequestDueAt
}
```

- `group` (label) and `user` / `studentId` (who submitted) stay on `BorrowRequest` for display.
  Ownership checks use `groupId`.
- The built-in Personal group has `id: "personal-<studentId>"`, `label: "ส่วนตัว"`,
  `type: "Personal"`. It is visible only to that student.
- Seed data gets `groupId` and group `type` values that match the existing seed labels and types.

## 5. API changes (`storageApi.ts`, with a react-query hook for each in `hooks.ts`)

### New

| Call | Caller | Behaviour |
|---|---|---|
| `getCurrentStudent()` | student | returns the mock current `Student` |
| `setCurrentStudent(studentId)` | dev switcher | changes the mock current student |
| `createBorrowRequest({ groupId, items: {itemId, qty}[] })` | student | Rejects if there are no lines, any qty < 1 or qty > item `total`, or the group isn't one of the current student's. Creates `OPEN` with `createdAt = now`, `type` and `group` from the group, `user` and `studentId` from the current student. Returns the request. |
| `getMyRequests()` | student | Requests whose `groupId` is in the current student's groups, newest first. Lines are decorated with `available` the same way as `getBorrowRequest`. |
| `cancelBorrow(id)` | student | Only from `OPEN` or `UNFULFILLED`. Sets `CANCELLED` with `BY_STUDENT` and releases the request's reservation to the pool. |
| `confirmPickup(id)` | student or staff | Only from `READY_FOR_PICKUP`. Sets `CLOSED`, `pickedUpAt = now` and `dueAt = defaultDueAt`. Creates one `PendingReturnItem` per issued Unique unit (with serial) and one per issued Bulk line (qty), each with `requestId`, `groupId`, `group` and `dueAt`. |
| `getMyPendingReturns()` | student | Owed items for the current student's groups. Sorted: `NOT_BROUGHT` first, then overdue (`now > dueAt`), then by `dueAt` ascending. |
| `getDefaultDueAt()` / `setDefaultDueAt(at)` | staff | Default semester due date (epoch ms). The seed default is the end of the current semester. |
| `setRequestDueAt(id, at)` | staff | Only on `CLOSED` requests. Updates the request's `dueAt` and the `dueAt` of its owed items. Rejects dates before `pickedUpAt`. |

### Changed

- `confirmBorrow(id, lines, pickup)` stores `pickup` on the request (it is thrown away today).
- `expireReservations()`: when a restock reservation expires and the request is still `UNFULFILLED`,
  set it to `CANCELLED` with `RESTOCK_EXPIRED`. Units go back to the pool as they do today.
- `getPendingReturns(studentId)` (staff walk-in return) returns owed items for **all groups of that
  student**, which follows decision 1. Its return logic doesn't change.
- `reopenBorrow(id)` rejects after `expiresAt` with "หมดเวลาเปิดคำขอแล้ว". By then the request is
  already `CANCELLED`.

## 6. Student UI

### Hub: `StudentStoragePage` (`/student/storage`)

- Header "คลังอุปกรณ์". `DevStudentSwitcher` sits at the top right, only when `import.meta.env.DEV`.
- `RestockBanner` sits above the tabs on every tab. It shows each of the student's requests with an
  active `restock` flag: item names, a live countdown to `expiresAt`, and a "เปิดคำขอ" button
  (`reopenBorrow`).
- `Tabs` (new, small): text tabs, active one in brand blue with an underline, count badges.
  The active tab and the selected request live in the URL: `?tab=borrow|requests|owed&id=<requestId>`.
  - "ยืมอุปกรณ์": no badge
  - "คำขอของฉัน": count of `READY_FOR_PICKUP` plus restock-flagged requests
  - "ที่ต้องคืน": count of owed items
- Laptop-first layout. Mobile layout is out of scope for phase 1.

### Tab "ยืมอุปกรณ์": `CatalogPage`

- A search box filters by name or code.
- A grid of picture cards: `ItemImage`, name, "ว่าง N" in green, or an amber "หมด · ต่อคิวได้"
  label when `available` is 0. The card shows "+ เพิ่ม" until the item is in the cart, then a
  quantity stepper (1 to `total`).
- Right column `RequestForm` (the cart):
  - a group picker (current student's groups), with the derived `type` shown read-only underneath
  - the cart lines; a line with qty > `available` shows "⚠ รอคิว"
  - a "ส่งคำขอ" button, disabled when the cart is empty or no group is picked
- After a successful submit, a `ResultDialog` appears, the cart clears, and the page goes to
  `?tab=requests&id=<new id>`.

### Tab "คำขอของฉัน": `MyRequestsPage`

- Left: a list of requests (id, status pill, group, item summary). Clicking one sets `?id=`.
- Status pills:
  - `OPEN` "รอดำเนินการ": indigo
  - `READY_FOR_PICKUP` "พร้อมรับ": green
  - `UNFULFILLED` "ของหมด": amber, or "ของหมด · มีของแล้ว" while restock-flagged
  - `CANCELLED` "ยกเลิก · โดยผู้ขอ" / "ยกเลิก · หมดเวลา": grey
  - `CLOSED` "รับของแล้ว": grey
- Right: detail panel for the selected request (with no selection: the first request, or an empty
  state).
  - Header: id, pill, group, type, who submitted it, `createdAt`.
  - `PickupCard` (green), when `pickup` is set: location, `pickupAt`, remark.
  - Lines: "ได้ issued/req" with serials for Unique items. Before issue it shows only the requested qty.
  - `CLOSED`: pickup date and due date (`DueBadge`).
  - Actions:
    - "รับของแล้ว" (`READY_FOR_PICKUP`), with a confirmation dialog
    - "เปิดคำขอ" with a countdown (restock-flagged)
    - "ยกเลิกคำขอ" (`OPEN` or `UNFULFILLED`), a secondary button with a confirmation dialog

### Tab "ที่ต้องคืน": `OwedPage`

- Group filter (all, or one group).
- Table: item (name, serial or "× qty", red "ยังไม่ได้นำมาคืน" tag for `NOT_BROUGHT`), group,
  request id, due date `DueBadge`. Rows use the API sort order.
- `DueBadge` colours: grey = more than 14 days left, amber = 14 days or less, red = overdue or `NOT_BROUGHT`.
- Read-only in phase 1, with an empty state: "ไม่มีอุปกรณ์ที่ต้องคืน".

## 7. Staff-side additions

- `StorageDashboardPage`: a "กำหนดคืนเริ่มต้น" date-time field (`setDefaultDueAt`) with the span from
  today shown read-only (for example "≈ 4 เดือนจากวันนี้"). A note says it applies to future pickups.
- `BorrowDetailPage`:
  - shows the stored pickup details on `READY_FOR_PICKUP` and later
  - adds a "ยืนยันรับของแล้ว" button on `READY_FOR_PICKUP` (`confirmPickup`)
  - on `CLOSED`, adds an editable "กำหนดคืน" (`setRequestDueAt`) with the loan span shown
    (for example "ยืม 131 วัน")
- `BorrowListPage`: `CANCELLED` shows a grey pill with the reason, and these requests are hidden by
  default behind a "แสดงที่ยกเลิก" toggle.
- `ReturnPage`: owed rows also show the request id and due date. Return logic doesn't change.

## 8. Errors

The API rejects with Thai messages, as the existing calls do. Pages show them inline or in a dialog.
The API re-checks every rule the UI guards:

- empty cart, qty < 1 or qty > `total`, or a group that isn't the student's (`createBorrowRequest`)
- cancelling a request that isn't `OPEN` or `UNFULFILLED`
- reopening after `expiresAt`
- confirming pickup on a request that isn't `READY_FOR_PICKUP`
- setting a due date on a request that isn't `CLOSED`, or a date before `pickedUpAt`

After any mutation, the hooks invalidate the inventory, borrow-request and pending-return queries, so
the staff and student views stay consistent.

## 9. Testing

Vitest, in `storageApi.test.ts`, same style as the existing tests:

- `createBorrowRequest`: valid request; rejects empty, qty 0, qty > total, and a foreign group;
  qty > available is accepted
- `getMyRequests`: returns only requests for the current student's groups; changes with `setCurrentStudent`
- `cancelBorrow`: OPEN → CANCELLED `BY_STUDENT`; a restock-flagged request frees its reserved units
- restock expiry: an unreopened flagged request becomes CANCELLED `RESTOCK_EXPIRED`; `reopenBorrow`
  after that rejects
- `confirmBorrow` stores `pickup`
- `confirmPickup`: READY → CLOSED; `dueAt` = default; owed items created with `requestId`,
  `groupId`, `group`, `dueAt`; rejects when not READY
- `setRequestDueAt`: updates the request and its owed items; rejects before `pickedUpAt`
- `getMyPendingReturns`: NOT_BROUGHT first, then overdue, then by `dueAt`

Manual check (one tab, shared mock): as student `6632199921`, create a request, then as staff issue
it with pickup details. As the student, see the pickup card and confirm pickup, then see the items
in "ที่ต้องคืน". As staff, extend the due date and see the student view update.

## 10. Out of scope (phase 2 or undecided)

- Drop-and-Go return, fine payment and slip upload, and notifications outside the app
- Real student auth and roles, and who may open staff pages
- Mobile layout
- Real backend storage module
