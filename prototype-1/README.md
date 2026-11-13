# prototype-1 — CEDT LabSync (working prototype)

**Role:** This is the actual implementation workspace for the CEDT LabSync working prototype — where the app gets built and run locally. Everything under `roles/` is design/spec; everything under here is real, runnable code.

- `backend/` — Fastify 5 + Prisma + PostgreSQL API (runs against a local Postgres, no Docker), built per [`roles/07-backend-developer/DEVELOPMENT-GUIDE.md`](../roles/07-backend-developer/DEVELOPMENT-GUIDE.md)
- `frontend/` — Vite + React 18 + TypeScript SPA, built per [`roles/06-frontend-developer/DEVELOPMENT-GUIDE.md`](../roles/06-frontend-developer/DEVELOPMENT-GUIDE.md)

## Status

**Working.** Both halves are implemented, wired together, and verified end to end (see [Verification](#verification)).

---

## Run it

Fully local — **no Docker**. You need a local PostgreSQL (Homebrew `postgresql@14`+ works) running on `:5432`, and Node.js 22.12+, 24.x or 26+. `.nvmrc` selects Node 24; this update was verified on Node 26.6.0.

```bash
# 1. Backend — schema, seed data, API on :3000
cd backend
cp -n config.example.env .env # then set DATABASE_URL to your local Postgres; keeps an existing .env
createdb labsync              # one-time: create the database
npm install
npx prisma migrate deploy     # creates the schema + the exclusion constraint
npx prisma generate
npm run db:seed
npm run dev                   # http://localhost:3000/api/v1

# 2. Frontend — SPA on :5173, proxies /api to the backend
cd ../frontend
npm install
npm run dev                   # http://localhost:5173
```

`DATABASE_URL` points at your local Postgres, e.g. `postgresql://$USER@localhost:5432/labsync?schema=public` (Homebrew installs use your OS user with trust auth — no password). The migrations create the `citext`, `btree_gist` and `pgcrypto` extensions themselves. If you're starting from a dirty DB, `npx prisma migrate reset --force` drops, recreates, migrates and re-seeds in one step.

Then open **http://localhost:5173**. The **calendar is public** — you can browse it without logging in (approved bookings only). Booking and management require a staff login.

### Test accounts (from the seed)

| Role | Email | Password |
|---|---|---|
| Staff | `admin@cedt.edu` | `admin1234` |
| Staff | `somchai@cedt.edu` | `instr1234` |
| Staff | `anucha@cedt.edu` | `instr1234` |
| Staff | `pimchanok@cedt.edu` | `instr1234` |
| Staff | `krit@cedt.edu` | `instr1234` |
| Student (Course Change) | `student@cedt.edu` | `student1234` |
| Student (Course Change) | `student2@cedt.edu` | `student1234` |
| Student (Course Change) | `student3@cedt.edu` | `student1234` |

**Staff** accounts can book, approve and manage master data. **Student** accounts only see the public calendar and **Course Change** (ลด / ถอนรายวิชา) — every LabSync staff API answers them with 403. Accounts are provisioned in the seed; there is no signup screen, by design. Anyone can view the calendar with no account at all.

### Try ลด / ถอนรายวิชา (Course Change)

- **Student:** log in as `student3@cedt.edu` → sidebar **ลด - ถอนรายวิชา** (`/course-change`).
- **Staff:** log in as `admin@cedt.edu` → `/admin` → **ลด - ถอนรายวิชา** (`/admin/course-change`).

A student can only submit for a course whose submission dates staff have **published**. For a
ready-made demo, run once in `backend/`:

```bash
npm run demo:course-change-v2   # adds synthetic course DEMO-CC-V2 for student3, open from today for 7 days
```

Or as staff: **กำหนดรายวิชา / Block** → **เพิ่มกำหนดรายวิชา** → pick a course, set วันเปิดรับ / วันปิดรับ
around today, tick Reg Chula or PI and **ประกาศใช้งาน** → save. Then submit as the student, and review it
as staff under **คำร้อง**.

The seeded term ends on 2026-11-27. After that date, set `COURSE_CHANGE_TODAY=2026-11-20` in
`backend/.env` and restart the API (the page shows a "วันที่จำลอง" badge). Reg Chula, PI and LINE are
mocks; there is no SSO. Details: [`docs/course-change/`](../docs/course-change/).

### Seeded state

1 building (E12), 7 rooms, 6 courses, 2 terms (2026 / Term 1 active, `2026-08-03` → `2026-11-27`), and 10 bookings: **5 approved**, **4 pending**, **1 rejected**.

The public (logged-out) calendar shows only the **approved** bookings. The pending requests are visible to logged-in staff on the Dashboard queue — including one — Krit's `CEDT101` Sec 2, E12-301, Mon 10:00–12:00 — deliberately sitting on top of an already-approved slot, so **approving it fails with a 409** (the BR-8 "first approval wins" demo).

The most interesting week to look at is **2026-08-17** (`/calendar?date=2026-08-17`).

### Other commands

```bash
cd backend
npm run test:prepare   # once: create + migrate + seed the isolated labsync_test DB (never touches labsync)
npm test               # all tests run against labsync_test (Course Change pins "today" to week 9)
npm run test:fresh     # recommended: create/migrate/seed a NEW scratch DB, test once, remove only that scratch DB
npm run db:seed   # idempotent; only seeds bookings when the booking table is empty
```

---

## Course Change — Auto Drop/Withdrawal Portal (ลด / ถอนรายวิชา)

Latest follow-up: [draft recovery, signature batches, phase waiting time and ready demo scenarios](../docs/course-change/FOLLOWUP-2026-11-04.md).

Current workflow: [4 November implementation and demo guide](../docs/course-change/IMPLEMENTATION-2026-11-04.md). [DESIGN.md v0.1](../docs/course-change/DESIGN.md) documents the historical version 1 routing matrix.

Open **http://localhost:5173/course-change** (header → *Course Change*).

- **Student view (v2)** — published dates per course/Section, enrolled and permitted course selection, submission review, corrections in the original request, private PDF documents, ordered two-file merge, explicit Reg/PI work with references, and live tracking. Missing or draft schedules never inherit a term-wide opening.
- **Staff view (v2)** — course/term, Section and workflow-stage filters; batch review and CSV collection; request/correction review; signature handoff and signed-file return; document checks, correction cycles, registrar handoff and a separate final-result record. New requests never invoke mock Reg/PI at submission or review.
- **Usability update (2026-10-27)** — responsive request cards, click/keyboard navigation, searchable paginated inboxes with server counts, confirmation before submit/cancel/approve/bulk, per-request bulk errors, and server validation that the submitted route still matches the preview. The UI labels external handoffs and HTML documents as simulated.
- **Polish update (2026-10-28)** — separate student compose/tracking views, searchable course selection, persistent recoverable errors, direct notification links, staff course/term grouping and safe selected-summary CSV export, accessible dialogs and reduced-motion interactions. See [rport 28/10](../docs/course-change/rport-28-10.md) for verified work, screenshots and requirements still awaiting the real operator. These are historical verification notes; the configurable document workflow was added on 4 November (see the current guide above).
- **Recovery update (2026-10-28)** — per-account/per-term drafts in the current tab (24-hour restore window, cleared on successful submission, explicit clearing or sign-out); durable submission keys and a read-only result lookup prevent duplicate submissions after a lost response. Programme notes are shown even on eligible courses and refreshed before confirmation. Sign-out/session expiry clear private cached data, while a server outage offers retry without clearing the tab draft. [User trial guide](../docs/course-change/UAT-28-10.md).
- **Course Change settings** — **กำหนดรายวิชา / Block** manages explicit per-course/Section teaching, petition and Final dates, route tasks, draft/publication, overlap and stale-edit checks, and audit reasons. **สิทธิ์รายวิชา / ตารางเดิม** manages per-course permission/notes and the historical term matrix. Existing requests retain their snapshotted workflow. Staff roles are still shared pending confirmation of real authority.
- **Historical v1 demo flows (existing requests only)** — A `reg_direct` (simulated Reg Chula), B `advisor_pi` (advisor approves → example HTML document with SHA-256 hash → simulated Reg Chula + PI), C `program_registrar` (programme approves → simulated สนท. handoff). These do not certify official documents, signatures or registry results. Reg Chula, PI and LINE are mock adapters in `backend/src/modules/course-change/integrations.ts`.

**Demo dates:** new requests use published course dates; old term routes are reference only. Routing depends on "today". Set `COURSE_CHANGE_TODAY=2026-08-20` (week 3) in `backend/.env` and restart the API to see other flows; leave it unset for the real date. The page shows a "วันที่จำลอง" badge while it is set.

For an existing checkout, run `npm run db:deploy` and `npx prisma generate` in `backend`. The 4 November migrations add versioned workflows, private PDF storage, per-course schedules and optional teaching dates without rewriting old requests. Prepare the isolated synthetic course for student3 with `npm run demo:course-change-v2`; it adds `DEMO-CC-V2` without resetting any records or overwriting existing schedules. Each run also creates a fresh DROP/SIGN/REGISTRAR/EDIT demo series and clearly labelled synthetic PDF fixtures; consult the follow-up guide for the prepared DF7A6B series. Dates are demonstrative, not university policy.

Verified 4 November 2026: backend `npm run test:fresh` **111/111**, frontend `npm test` **39/39**, both builds and `git diff --check` pass. Browser access was rejected by the browser-control policy, so the new UI has not been visually or interactively checked in-browser. Use the [current demo/UAT steps](../docs/course-change/IMPLEMENTATION-2026-11-04.md). Dependency audits reported 0 known vulnerabilities on 28 October; that historical result is not a new audit of every package today.

Seeded: 3 students with enrollments, the five routing windows for 2026/1, CEDT499 deliberately *not* announced, and 6 sample requests (1 completed Flow A, 3 pending, 1 processing Flow B with its document, 1 rejected).

---

## What's implemented

**Backend** — a single **staff** role (session-cookie auth: argon2id, 5-strike/15-minute lockout, CSRF via `X-Requested-With`) plus an **anonymous public calendar** (no login → approved bookings only), booking create (auto-approved for staff) / approve / reject / cancel / withdraw / move, the conflict engine (recurrence expansion, one `findConflicts` behind all four call sites, alternative-room suggestions, non-blocking capacity warnings), master-data CRUD with soft delete and warn-and-confirm, announcement draft/create/update/publish endpoints with server-side rich-text sanitization, transactional in-app notifications, and CSV import (dry-run + commit) for courses and rooms.

**The G1 guarantee is enforced by the database**, not just by application code: `booking_occurrences` carries a generated `tstzrange` column plus a partial GiST exclusion constraint (`no_double_booking`) that makes two overlapping *approved* bookings in one room physically unrepresentable. Half-open `[)` ranges mean back-to-back bookings (10:00–12:00 / 12:00–14:00) never collide.

**Frontend** — the screens (public read-only Calendar, Login, Dashboard + pending queue, Master Calendar weekly + daily, New Booking, My Requests, Master Data, and announcement list/create/detail/edit with a TipTap rich-text editor), the monochrome design system (status is texture — solid / striped-dashed / heavy-outline — with no red, green or amber anywhere), the hand-built calendar grid with side-by-side overlap layout, the real-time conflict check with debounce + request cancellation + out-of-order-response discard, URL-driven calendar state, and the 45-second-polling notification bell.

---

## Deviations from spec

These are the only places the implementation departs from the two guides.

1. **Runs against a local Postgres, no Docker.** The app connects to a locally-installed PostgreSQL on `:5432` (`DATABASE_URL` in `.env`); there is no `docker-compose.yml`. The migrations create the `citext`, `btree_gist` and `pgcrypto` extensions, so any recent Postgres with the standard contrib modules works.

2. **Form `<select>`s are styled native selects, not Radix `Select`.** They are visually identical to the shadcn component (same height, border, chevron) but work directly with `react-hook-form`'s `register()` instead of needing a `Controller` per field. Radix *is* used everywhere behaviour matters: Dialog, DropdownMenu, Popover, Switch, Avatar, Separator, Label.

3. **shadcn/ui components are hand-written rather than generated via `npx shadcn add`.** Same source and class names — just committed directly, since the CLI is interactive.

4. **Seed ordering differs from the guide's literal instruction.** The guide describes seeding a pending booking that overlaps an *approved* one — but the API refuses exactly that at submit time (BR-6), so it cannot be created through the service. Instead, every booking is created first (while nothing is approved, so pending-vs-pending overlap is legal per BR-3) and the five approvals happen afterwards. The end state is precisely what the guide asks for, including the BR-8 conflict demo.

5. **The Room-Utilization KPI is the hardcoded `67%` placeholder** the frontend guide explicitly permits. The other two KPI cards are computed from live data.

6. **Drag-and-drop rescheduling is not built** — it is the guide's stretch goal. The keyboard/menu **Move** dialog it says to build first *is* implemented: click an approved block → Move → room/date/time, with the occurrence-vs-series choice for recurring bookings, and a 409 that keeps the dialog open and names the clash.

7. **The `booking_events` audit table is implemented**, though the backend guide lists it as optional for the prototype, so `GET /bookings/:id` returns a real `events[]` timeline.

Not built, per the guides' own out-of-scope lists: email/LINE notifications, CSV export, SSO, student views, and the optional MSW mocks (the real backend runs locally, so they would be redundant).

---

## Verification

Both guides ship a verification checklist; both were run against the running stack.

**Backend** — `npm test` plus a manual `curl` run of the critical flow:

- staff login → check-conflicts → create → the booking is **auto-approved** and immediately blocking → approving a second booking on the same slot fails with a 409.
- Back-to-back bookings do **not** conflict; overlapping ones do.
- Only approved (blocking) bookings block; the capacity warning appears and does **not** block submission.
- The **public** calendar (no session) returns approved bookings only — pending requests never appear.
- CSRF, terminal-state transitions, off-grid and inverted times, duplicate course codes, and the room-deactivation warn-and-confirm flow all behave as specified.

**The database-level guarantee** was proved by bypassing the application entirely and inserting a duplicate blocking occurrence straight into Postgres with `psql`:

```
ERROR: conflicting key value violates exclusion constraint "no_double_booking"
```

…while a back-to-back 12:00–14:00 insert next to an existing 10:00–12:00 in the same room succeeds.

**Frontend** — driven in a real browser: the **logged-out** `/calendar` renders the seeded approved bookings read-only, with a "Log in" button and no booking/approve controls; `/admin` while logged out redirects to `/login?next=/admin`; a wrong password shows the generic gray banner; after a staff login the merged nav (Calendar, New Booking, My Requests, Dashboard, Master Data) renders; the weekly grid and the daily room-lane view both render the seeded bookings; the course typeahead auto-fills the read-only course name; a conflicting slot raises the blocking banner with alternative-room chips and a disabled Submit, and clicking a chip re-runs the check, clears the banner and enables Submit; submitting reaches the success screen with an `LS-…` request number for a booking that is immediately approved; the Dashboard queue's Approve on the deliberately-conflicting seeded row fails with the inline 409 explanation; and deactivating E12-301 raises the "record is in use" dialog listing the affected bookings.
