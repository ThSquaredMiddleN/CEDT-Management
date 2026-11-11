# prototype-1 — CEDT LabSync (working prototype)

**Role:** This is the actual implementation workspace for the CEDT LabSync working prototype — where the app gets built and run locally. Everything under `roles/` is design/spec; everything under here is real, runnable code.

- `backend/` — Fastify 5 + Prisma + PostgreSQL API (runs against a local Postgres, no Docker), built per [`roles/07-backend-developer/DEVELOPMENT-GUIDE.md`](../roles/07-backend-developer/DEVELOPMENT-GUIDE.md)
- `frontend/` — Vite + React 18 + TypeScript SPA, built per [`roles/06-frontend-developer/DEVELOPMENT-GUIDE.md`](../roles/06-frontend-developer/DEVELOPMENT-GUIDE.md)

## Status

**Working.** Both halves are implemented, wired together, and verified end to end (see [Verification](#verification)).

---

## Run it

Fully local — **no Docker**. You need a local PostgreSQL (Homebrew `postgresql@14`+ works) running on `:5432`, and Node 20+.

```bash
# 1. Backend — schema, seed data, API on :3000
cd backend
cp .env.example .env          # then set DATABASE_URL to your local Postgres (see below)
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

There is a single **staff** role: every account can book, approve and manage master data. Accounts are provisioned in the seed; there is no signup screen, by design. Anyone can view the calendar with no account at all.

### Seeded state

1 building (E12), 7 rooms, 6 courses, 2 terms (2026 / Term 1 active, `2026-08-03` → `2026-11-27`), and 10 bookings: **5 approved**, **4 pending**, **1 rejected**.

The public (logged-out) calendar shows only the **approved** bookings. The pending requests are visible to logged-in staff on the Dashboard queue — including one — Krit's `CEDT101` Sec 2, E12-301, Mon 10:00–12:00 — deliberately sitting on top of an already-approved slot, so **approving it fails with a 409** (the BR-8 "first approval wins" demo).

The most interesting week to look at is **2026-08-17** (`/calendar?date=2026-08-17`).

### Other commands

```bash
cd backend
npm test          # integration tests against your local Postgres
npm run db:seed   # idempotent; only seeds bookings when the booking table is empty
```

---

## What's implemented

**Backend** — a single **staff** role (session-cookie auth: argon2id, 5-strike/15-minute lockout, CSRF via `X-Requested-With`) plus an **anonymous public calendar** (no login → approved bookings only), booking create (auto-approved for staff) / approve / reject / cancel / withdraw / move, the conflict engine (recurrence expansion, one `findConflicts` behind all four call sites, alternative-room suggestions, non-blocking capacity warnings), master-data CRUD with soft delete and warn-and-confirm, transactional in-app notifications, and CSV import (dry-run + commit) for courses and rooms.

**The G1 guarantee is enforced by the database**, not just by application code: `booking_occurrences` carries a generated `tstzrange` column plus a partial GiST exclusion constraint (`no_double_booking`) that makes two overlapping *approved* bookings in one room physically unrepresentable. Half-open `[)` ranges mean back-to-back bookings (10:00–12:00 / 12:00–14:00) never collide.

**Frontend** — the screens (public read-only Calendar, Login, Dashboard + pending queue, Master Calendar weekly + daily, New Booking, My Requests, Master Data), the monochrome design system (status is texture — solid / striped-dashed / heavy-outline — with no red, green or amber anywhere), the hand-built calendar grid with side-by-side overlap layout, the real-time conflict check with debounce + request cancellation + out-of-order-response discard, URL-driven calendar state, and the 45-second-polling notification bell.

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

Not built, per the guides' own out-of-scope lists: email notifications, CSV export, SSO, student views, and the optional MSW mocks (the real backend runs locally, so they would be redundant).

---

## LINE notifications (optional)

Staff can link their LINE account and get every in-app notification (submitted, approved, rejected, moved,
cancelled, withdrawn) pushed to LINE as well, in Thai then English. Code: `backend/src/modules/line/`,
`frontend/src/features/line-link/`. It is **off unless both LINE keys are set**, so the app runs as before without them.

**How linking works:** the staff member adds the LINE Official Account → the bot replies with a one-time link
(`/line/link?token=…`, valid 15 minutes, single use) → they log in as usual and press **Confirm** → done.
Unfollowing the OA, or `POST /api/v1/line/unlink`, removes the link. Only notifications created after linking are
sent, so linking never floods old ones.

**Setup**

1. In the [LINE Official Account Manager](https://manager.line.biz/), create an OA and enable the Messaging API.
   In [LINE Developers](https://developers.line.biz/console/), copy the **channel secret** and issue a
   **long-lived channel access token**.
2. In `backend/.env` (never commit it):
   ```
   LINE_CHANNEL_SECRET=...
   LINE_CHANNEL_ACCESS_TOKEN=...
   # optional: LINE_LINK_TTL_MINUTES=15, LINE_DISPATCH_INTERVAL_MS=5000
   ```
   `APP_ORIGIN` is also the base of the link the bot sends, so it must be a URL the phone can open.
3. LINE needs a public HTTPS webhook. Locally, a quick tunnel works:
   `cloudflared tunnel --url http://localhost:3000`, then set the webhook URL in LINE Developers to
   `https://<tunnel>/api/v1/line/webhook`, turn **Use webhook** on, and press **Verify**. Turn **Webhook redelivery**
   on too, so a failed delivery is retried.
4. `npx prisma migrate deploy` (adds `users.line_user_id`, `users.line_linked_at`, `line_link_tokens`,
   `line_webhook_events`), then `npm run dev`.

**Behaviour worth knowing**

- The webhook is checked against LINE's signature over the raw body and is the only route exempt from the
  `X-Requested-With` CSRF rule (`config: { csrf: false }`). Bad or missing signature → 401.
- The dispatcher polls for undelivered notifications every 5 s and marks `notifications.delivered_line_at`.
  A LINE 429 (rate limit or monthly push quota) pauses it for 60 s; a notification that can't be rendered or that
  LINE rejects permanently is marked and logged, not retried. Deactivated users get nothing.
- The free LINE plan has a monthly push quota (each notification is one push).
- `migration.sql` for `line_notify` was trimmed by hand: `prisma migrate diff` also proposes dropping
  `booking_occurrences.timeslot`, the raw-SQL column behind the exclusion constraint. **If `prisma migrate dev`
  ever proposes that drop, remove it** or `no_double_booking` is lost.
- Tests (`backend/test/line/`) use a fake LINE client and fake credentials from `vitest.config.ts`; they never call
  LINE.

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
