# Course Change — Live Demo Guide (DEMO-002)

> One deterministic run: **student `student@cedt.edu` withdraws `2110423 วิศวกรรมซอฟต์แวร์`**,
> advisor **Dr. Anucha** approves it, the student sees the new status — and Prisma Studio shows
> every database change as it happens. Rehearsed end-to-end on 2026-10-09 (see §H for the exact
> records it produced). Database background: [DATABASE.md](DATABASE.md), [ERD.md](ERD.md).

---

## A. Startup commands

Start Docker Desktop first, then (each in its own terminal):

```bash
cd ~/Desktop/CU/CEDT-3/CEDT-Management/prototype-1 && docker compose up -d
```
```bash
cd ~/Desktop/CU/CEDT-3/CEDT-Management/prototype-1/backend && npm run dev
```
```bash
cd ~/Desktop/CU/CEDT-3/CEDT-Management/prototype-1/frontend && npm run dev
```
```bash
cd ~/Desktop/CU/CEDT-3/CEDT-Management/prototype-1/backend && npx prisma studio --browser none
```

Pre-flight (all must pass):

```bash
cd ~/Desktop/CU/CEDT-3/CEDT-Management/prototype-1/backend && npm run demo:reset
```
→ must print `Nothing to reset: student@cedt.edu has no request for 2110423 …` (if it lists a
request, run the reset in §L first).

```bash
curl -s localhost:3000/health
```
→ `{"ok":true}`

## B. Local URLs

| What | URL |
|---|---|
| App (Student + Staff portal) | http://localhost:5173/course-change |
| Login | http://localhost:5173/login |
| API health | http://localhost:3000/health |
| Prisma Studio | http://localhost:5555 |

## C. Test accounts (seeded test data — not real people)

| Role in the demo | Email | Password |
|---|---|---|
| Student (demo) | `student@cedt.edu` — ธนกร ศรีสุข, 6630000121 | `student1234` |
| Advisor / staff (demo) | `anucha@cedt.edu` — Dr. Anucha T. (advisor of the demo student) | `instr1234` |
| Other students (background data) | `student2@cedt.edu`, `student3@cedt.edu` | `student1234` |
| Other staff | `admin@cedt.edu` / `admin1234`; `pimchanok@`, `somchai@`, `krit@cedt.edu` / `instr1234` | |

**Tip:** open the student in a normal window and the staff in a **private/incognito window**.
You then never need to log out between roles (logging out via the menu triggers a harmless burst
of 401s in the console — see §J).

## D. Demo course and student

| | |
|---|---|
| Student | `student@cedt.edu` (ธนกร ศรีสุข) — synthetic enrollment, advisor Dr. Anucha |
| Course | **2110423 วิศวกรรมซอฟต์แวร์** (real CEDT catalog code) |
| Request type | **ถอนรายวิชา (withdraw)** |
| Route | today = 2026-10-09 = **week 10** → withdraw weeks 7–12 = **Flow B** (advisor → document → Reg Chula + PI) |
| Deadline shown | **ยื่นได้ถึง 25 ต.ค. 2569** |

⚠️ The route depends on the real date. Flow B is valid until **25 Oct 2026** (end of week 12).
Presenting later? Pin the date: add `COURSE_CHANGE_TODAY=2026-10-09` to `backend/.env` and restart
the API — the page then shows a "วันที่จำลองสำหรับเดโม" badge (say so honestly). Remove the line afterwards.

Background data the audience will also see (seeded scenario requests, real codes, kept on purpose):

| Request | Student | Course | State |
|---|---|---|---|
| CR-2026-00021 | student@ | 2110405 drop | completed (Flow A) |
| CR-2026-00022 | student@ | 2110471 withdraw | pending (Flow B) |
| CR-2026-00023 | student2@ | 2110322 withdraw | processing (Flow B, has document) |
| CR-2026-00024 | student2@ | 2110313 drop | pending (Flow C) |
| CR-2026-00025 | student3@ | 2110328 withdraw | pending (Flow B) |
| CR-2026-00026 | student3@ | 2110215 drop | rejected (with reason) |

## E. Student Portal — step by step

1. Go to http://localhost:5173/login → `student@cedt.edu` / `student1234` → **Sign In**. You land on **ลด / ถอนรายวิชา**.
2. Point at the header: *ภาคการศึกษาที่ 1/2569 · วันนี้ 9 ต.ค. 2569 · สัปดาห์ที่ 10*, and the week 1–18 timeline (the routing matrix).
3. In the **ประเภทคำร้อง** bar click **ถอนรายวิชา**. The bar changes to *Flow B: อาจารย์ที่ปรึกษา → เอกสาร → PI* and **ยื่นได้ถึง 25 ต.ค. 2569**.
4. In **1 เลือกรายวิชา** show: six real CEDT courses; **2110405** and **2110471** are greyed out with *มีคำร้อง…แล้ว (CR-…)* (duplicate prevention); the note *ข้อมูลการลงทะเบียนเป็นข้อมูลสาธิต (สังเคราะห์)* (honest about synthetic enrollments). Section/credits show "—" because they are unknown, not invented.
5. Click the **2110423 วิศวกรรมซอฟต์แวร์** card.
6. In **2 เหตุผล** type a reason, e.g. *ภาระงานสหกิจศึกษาชนกับเวลาเรียน ไม่สามารถเข้าเรียนได้ครบตามเกณฑ์*.
7. Show **3 เส้นทางคำร้องของคุณ** — the 5 steps that will happen.
8. Click **ยื่นคำร้อง** (top right) → confirm dialog → **ยืนยันยื่นคำร้อง**.
9. The **ติดตามสถานะคำร้อง** dialog opens: new **CR-2026-000xx**, status **รออนุมัติ**, step 2 *อาจารย์ที่ปรึกษาอนุมัติ — กำลังรอขั้นตอนนี้*. Close it; the request is the first row of the table.
10. → switch to Prisma Studio (§G, "after submission").

## F. Staff Portal — step by step

1. In the private window: login `anucha@cedt.edu` / `instr1234`. The bell shows unread notifications (one is the new submission).
2. Open **ลด / ถอนรายวิชา** (menu **Course Change**). Tab **รออนุมัติ** lists the pending requests; the new one is at the top and already selected.
3. Review in the right pane: student name + student number, advisor, course, week 10, Flow B chip, reason, progress (step 2 current), audit log (*ยื่นคำร้อง*).
4. Click **อนุมัติ** (bottom right). Toast *อนุมัติ CR-… แล้ว*. The request leaves **รออนุมัติ**.
5. Open tab **กำลังดำเนินการ** → select it: steps 1–4 ticked, last step *ทะเบียนยืนยันผล — กำลังรอขั้นตอนนี้*; **เอกสารคำร้องรวม (พระเกี้ยว + เกียร์)** card; Reg Chula / PI refs (`REG-…`, `PI-…`).
6. Optional: click the document card → printable page, banner *ตรวจสอบแล้ว: เนื้อหาตรงกับที่อนุมัติ*.
7. → switch to Prisma Studio (§G, "after approval").

**Back to the student window:** click into the window (it refetches on focus) or press F5 →
the row shows **กำลังดำเนินการ**; **ติดตามสถานะ** shows the timeline (4 of 5 steps done) and the
audit log; the bell has *CR-… ถอน 2110423 ได้รับการอนุมัติแล้ว — ระบบส่งต่อให้ทะเบียนอัตโนมัติ*.

**Say this clearly:** after approval the request is **processing**, not completed. The registrar
has **not** confirmed the withdrawal — the last step waits for that, and `completedAt` stays empty.

## G. Prisma Studio walkthrough

Open http://localhost:5555. Studio does **not** auto-refresh — reload the page (⌘R) after each app action.

**Model ↔ table mapping** (Prisma model names, `@@map` table names):

| Prisma model | PostgreSQL table | Show |
|---|---|---|
| `User` | `users` | the 3 students with `studentNo`, `advisorId` → Dr. Anucha; 5 staff |
| `Course` | `courses` | 42 rows: 36 with `catalogSource = cedt-google-forms` + 6 legacy `CEDT…` (kept for room bookings; never selectable in Drop/Withdraw) |
| `Enrollment` | `enrollments` | demo student's rows: `source = synthetic-demo`, `section`/`credits` empty |
| `AllowedCourse` | `allowed_courses` | 2110423: `allowDrop = true`, `allowWithdraw = true` |
| `CourseChangeWindow` | `course_change_windows` | 5 rows = routing matrix (withdraw 7–12 → `advisor_pi`) |
| `CourseChangeRequest` | `course_change_requests` | the demo request |
| `CourseChangeEvent` | `course_change_events` | its audit trail |
| `Notification` | `notifications` | its two notifications |

Field names in Studio are camelCase (`requestNo`, `studentId`, `weekNo`, `decidedById`, `createdAt`);
the columns are snake_case (`request_no`, `student_id`, `week_no`, `decided_by`, `created_at`).

**Relationships to show** (relation columns in Studio are clickable):

- *Student → Enrollment → Course*: `User` (student@cedt.edu) → `enrollments` → row for 2110423 → `course`.
- *Student → CourseChangeRequest → Course*: `CourseChangeRequest` → `student` and `course` relation fields.
- *CourseChangeRequest → CourseChangeEvent*: request → `events` (1 after submit, 5 after approval).
- *CourseChangeRequest → Notification*: request → `notifications` (1 after submit, 2 after approval).

**Before submission** (record these on screen):
- `Enrollment`: filter `studentId` = the demo student → the 2110423 row exists.
- `Course`: 2110423 `วิศวกรรมซอฟต์แวร์`, `isActive = true`.
- `AllowedCourse`: 2110423 → `allowWithdraw = true`.
- Model list counter: **CourseChangeRequest 6**, CourseChangeEvent 13, Notification 75.

**After submission** — reload: CourseChangeRequest **7**. Open the new row and point at
`requestNo`, `studentId`, `courseId`, `requestType = withdraw`, `status = pending_approval`,
`flow = advisor_pi`, `weekNo = 10`, `createdAt`.

**After approval** — reload: same row now `status = processing`, `decidedById` (Dr. Anucha),
`decidedAt`, `documentHash`, `regChulaRef`, `piRef`, `completedAt` **empty**. `CourseChangeEvent`
shows 5 rows for it; `Notification` shows `cc_submitted` (to Dr. Anucha) and `cc_approved` (to the
student, `deliveredLineAt` set by the LINE **mock**).

## H. Expected database changes

| Moment | CourseChangeRequest | CourseChangeEvent | Notification |
|---|---|---|---|
| Clean baseline | 6 | 13 | 75 (58 booking + 17 Course Change) |
| After submission | 7 — new row `pending_approval`, `advisor_pi`, week 10 | 14 — `submitted` (actor: student) | 76 — `cc_submitted` → anucha@ |
| After approval | 7 — same row `processing`, `decided_by`, `decided_at`, `document_hash`, `reg_chula_ref`, `pi_ref`; `completed_at` NULL | 18 — + `approved` (anucha), `document_generated`, `sent_to_reg_chula`, `sent_to_pi` (system) | 77 — + `cc_approved` → student@ |

Nothing else changes: users, enrollments, courses, announcements, windows, terms and all booking
data stay identical. Rehearsal record (2026-10-09): CR-2026-00028, events 82–86, decided 18:33:53.

## I. Expected UI states

| Where | Before | After submit | After approval |
|---|---|---|---|
| Student course card 2110423 | selectable | greyed: *มีคำร้องถอนรายวิชานี้แล้ว (CR-…)* | greyed |
| Student table row | — | **รออนุมัติ** (dashed badge) | **กำลังดำเนินการ** (striped badge) |
| Student timeline | — | step 2 current | steps 1–4 done, *ทะเบียนยืนยันผล* waiting |
| Staff tabs | รออนุมัติ 3 | รออนุมัติ 4 | รออนุมัติ 3, กำลังดำเนินการ 2 |
| Staff detail | — | buttons ไม่อนุมัติ / อนุมัติ | document card + Reg Chula/PI refs + *บันทึกผลจากทะเบียน* |

## J. Troubleshooting

| Symptom | Fix |
|---|---|
| Page won't load / API errors | Docker Desktop running? `docker ps` shows `labsync-postgres (healthy)`? |
| Frontend says port 5173 in use | Another Vite is running — stop it (the API only trusts `localhost:5173`) |
| Login fails with 403 | Use exactly `http://localhost:5173` (not 127.0.0.1) — CSRF origin check |
| 2110423 is greyed out at the start | A previous run is still there → §L reset |
| Withdraw shows Flow C or "ปิดรับ" | Date is past week 12 → §D `COURSE_CHANGE_TODAY` |
| Studio shows old numbers | Studio doesn't auto-refresh → reload the page |
| Studio port 5555 busy | `npx prisma studio --browser none --port 5556` |
| Student doesn't see the new status | Click into the window or press F5 (polls every 30 s) |
| Red 401s in the console after logout | Known, harmless (cache cleared while page still mounted); use two windows |

## K. Mocked integrations — say this out loud

| Shown in the demo | Reality |
|---|---|
| Reg Chula ref `REG-CR-…` | **Mock** adapter (`backend/src/modules/course-change/integrations.ts`) — nothing is sent to Reg Chula |
| PI ref `PI-CR-…` | **Mock** — nothing is uploaded |
| LINE delivery (`deliveredLineAt`) | **Mock** — no LINE message is sent; in-app bell is real |
| Login | Local accounts, **not** Chula SSO |
| "ลายเซ็นดิจิทัล" label / document | Printable HTML + **SHA-256 content hash** for integrity — **not** a PDF and **not** a digital signature |
| Enrollments | **Synthetic** demo data, not from Reg Chula |
| Registrar confirmation | Not automated; staff would record it (*บันทึกผลจากทะเบียน*). Not done in this demo |

## L. Resetting only the demo request (repeat presentation)

```bash
cd ~/Desktop/CU/CEDT-3/CEDT-Management/prototype-1/backend && npm run demo:reset
```
Dry run: lists the demo request(s) for `student@cedt.edu` + `2110423` with their event and
notification counts. Then:

```bash
cd ~/Desktop/CU/CEDT-3/CEDT-Management/prototype-1/backend && npm run demo:reset -- --apply
```

What it does (`backend/scripts/demo-reset.ts`): in one transaction deletes **only** that
student's requests for that course in the active term, their `course_change_events`, and their
`notifications` (never booking notifications). It refuses a non-local database, a non-student
account or a non-catalog course. It never touches users, enrollments, the catalog, terms, windows,
announcements, the six scenario requests, or any LabSync booking data.

After it runs, the counters return to the §H baseline (6 / 13 / 75). Request numbers are never
reused, so the next run gets a new number (CR-2026-00029, then 00030, …).

Never use `prisma migrate reset`, `prisma db push` or `TRUNCATE` for a demo reset.
