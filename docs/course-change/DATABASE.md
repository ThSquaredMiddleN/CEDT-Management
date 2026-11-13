# Course Change — Database (DATA-001)

> Scope: the database side of Drop/Withdrawal (ลด / ถอนรายวิชา) in LabSync `prototype-1`.
> Relationships and keys: [ERD.md](ERD.md). Workflow rules: [DESIGN.md](DESIGN.md).
> No passwords or connection strings appear in this document — they live only in `backend/.env`.

## 1. Architecture

```
React SPA (frontend/, Vite :5173)
   │  fetch /api/v1/*  (same-origin via Vite proxy, session cookie)
   ▼
Fastify API (backend/, :3000) ── modules/course-change/{routes,service}.ts
   │  Prisma Client 6
   ▼
PostgreSQL 17 in Docker (container labsync-postgres, 127.0.0.1:5433, DB "labsync")
```

The frontend never talks to PostgreSQL. Every course name/code the Student and Staff portals
show comes from the `courses` table through the API (`/course-change/eligible-courses`,
`/course-change/requests`); the frontend has no course list in its code.

## 2. Prisma schema location

- Schema: `prototype-1/backend/prisma/schema.prisma`
- Migrations: `prototype-1/backend/prisma/migrations/` (4: `init`, `exclusion_constraint`, `course_change`, `course_catalog`)
- Seeds: `prisma/seed.ts` (LabSync) → calls `prisma/seed-course-change.ts`; catalog data in `prisma/data/cedt-course-catalog.ts`
- Client: `backend/src/db.ts`

## 3. PostgreSQL in Docker

`prototype-1/docker-compose.yml` (currently untracked in git):

| Setting | Value |
|---|---|
| Image | `postgres:17-alpine` |
| Container | `labsync-postgres` |
| Port | `127.0.0.1:5433 → 5432` (localhost only) |
| Volume | `labsync-postgres-data` (data survives container restarts) |
| Healthcheck | `pg_isready` every 5 s |
| Credentials | environment block of the compose file and `backend/.env` (not reproduced here) |

⚠️ The compose file holds the DB password in plain text and is untracked — keep it out of git or
move the password to an env file before committing.

## 4. Existing models

| Model (table) | Owner | Notes |
|---|---|---|
| `User` (`users`) | shared | roles `staff`, `student`; `studentNo`, `advisorId` |
| `Session` (`sessions`) | shared | |
| `Term` (`terms`) | shared | one active term (partial unique index) |
| `Course` (`courses`) | shared | **`catalogSource` added in DATA-001** |
| `Notification` (`notifications`) | shared | `bookingId` or `courseChangeRequestId` |
| `Building`, `Room`, `Booking`, `BookingOccurrence`, `BookingEvent` | room booking | not used by Course Change |
| `CourseChangeWindow`, `AllowedCourse`, `Enrollment`, `CourseChangeRequest`, `CourseChangeEvent` | Course Change | |

Conceptual entities without a table (workflow steps, approvals, documents, revisions, phone /
year of study): see [ERD.md §I](ERD.md#i-conceptual-entities-that-are-not-implemented-proposed-not-in-the-database).

## 5. Course Change relationships

`enrollments` (student × term × course) and `allowed_courses` (term × course) decide what a
student may request; `course_change_windows` (term × type × weeks) decides when and through
which flow; `course_change_requests` reference student, term and course directly (not the
enrollment) and own their `course_change_events` and `notifications`. Details and cardinality:
[ERD.md §D–E](ERD.md#d-primary-and-foreign-keys).

## 6. Catalog seed strategy

**Source:** the course lists of the CEDT drop / withdraw Google Forms provided by the Product
Owner (DATA-001). 27 regular courses + 9 special topics = **36 courses**, codes and Thai names
copied verbatim into `prisma/data/cedt-course-catalog.ts`. Nothing else (credits, sections,
instructors) was in the source, so nothing else is stored.

**Mapping:** reuse the shared `courses` table — no second course model.

| Source | Column |
|---|---|
| course code (7 digits) | `courses.code` (unique) |
| Thai course name | `courses.name` |
| "comes from the CEDT form catalog" | `courses.catalog_source = 'cedt-google-forms'` |

**Idempotent upsert** (`seedCourseCatalog()` in `seed-course-change.ts`):

- keyed on `code`; `create` inserts code, name, catalog source;
- `update` only sets `catalog_source` — an existing row's **name, instructor and active flag are
  never overwritten**, so manual edits in Master Data survive re-seeding;
- ids are stable (same row every run); nothing is deleted.

**Legacy placeholders** (`CEDT101`, `CEDT205`, `CEDT210`, `CEDT330`, `CEDT415`, `CEDT499`) are
kept: every one is referenced by bookings. Their `catalog_source` is NULL, which removes them from
Course Change (they are not listed and cannot be submitted) while room booking keeps using them.

**Drop vs. withdraw lists:** the two Google Forms' lists differ slightly, but the list received is
already merged. Every catalog course is therefore announced for **both** types
(`allowed_courses.allow_drop = allow_withdraw = true`). The schema already supports the split per
course; it needs the per-form lists (§12).

## 7. Demo enrollment strategy

All enrollment rows are **synthetic demo data** for the three seeded test accounts, written with
`source = 'synthetic-demo'`, `section = NULL`, `credits = NULL`. They did **not** come from
Reg Chula, and the Student Portal says so under the course list.

| Student (test account) | Synthetic enrollments | Demo requests (seeded) | Free for a live demo |
|---|---|---|---|
| `student@cedt.edu` | 2110405, 2110413, 2110423, 2110426, 2110471, 2110488 | 2110405 drop **completed** (Flow A); 2110471 withdraw **pending** (Flow B) | **2110423** (reserved for the live demo — [DEMO-GUIDE.md](DEMO-GUIDE.md)), 2110413, 2110426, 2110488 |
| `student2@cedt.edu` | 2110313, 2110322, 2110356, 2110403, 5500205 | 2110322 withdraw **processing** (Flow B, document generated); 2110313 drop **pending** (Flow C) | 2110356, 2110403, 5500205 |
| `student3@cedt.edu` | 2110204, 2110215, 2110252, 2110328, 5500203, 2110582 | 2110328 withdraw **pending** (Flow B); 2110215 drop **rejected** (Flow C — may be retried) | 2110204, 2110215, 2110252, 5500203, 2110582 |


Demo requests are created through the real service on fixed past dates (so each lands in the
right week / flow) and are only created when that student has **no** request for that course
yet — re-seeding never duplicates them.

## 8. Data-integrity constraints

- `courses.code` unique → no duplicate catalog course.
- `enrollments (student_id, term_id, course_id)` unique → no duplicate enrollment.
- `allowed_courses (term_id, course_id)` unique.
- `one_live_course_change` partial unique index → at most one pending/processing/completed
  request per student + course + term, enforced even under concurrent submits.
- `ccr_reject_reason` CHECK → a rejected request always has a reason.
- `ccw_week_order` CHECK → valid week ranges.
- FKs with RESTRICT → courses/users referenced by Course Change cannot be deleted.

**Eligibility rules** (`eligibleCourses` / `submitRequest` in
`backend/src/modules/course-change/service.ts`), checked in this order:

| Rule | Check | Shown to student as |
|---|---|---|
| CC-BR-11 (DATA-001) | course has a `catalog_source` | not listed at all (submit → 422) |
| CC-BR-1 | student enrolled in the course this active term | not listed (submit → 422) |
| CC-BR-2 | no live request for the course | "มีคำร้อง…แล้ว (CR-…)" |
| CC-BR-11 (DATA-001) | `courses.is_active` | "รายวิชานี้ถูกปิดใช้งานในระบบ" (submit → 422) |
| CC-BR-1 | announced for this request type | "หลักสูตรไม่ได้เปิดให้…" (submit → 422) |
| CC-BR-4 | a window is open for this type this week | "ขณะนี้ไม่อยู่ในช่วงเวลา…" (submit → 422 `WINDOW_CLOSED`) |

CC-BR-11 is new in DATA-001 (it implements the brief's "course active status" requirement and
the catalog scoping). No university rule was changed.

## 9. Migration strategy

- Migrations are **additive and applied with `prisma migrate deploy`** — never `migrate reset`.
- `20261009120000_course_catalog` is hand-written SQL (add `courses.catalog_source`, relax
  NOT NULL on `enrollments.section/credits`, add `enrollments.source`). It was checked against
  `prisma migrate diff --from-schema-datasource` before being applied: identical except for one
  line Prisma always proposes and **must never be applied** — `DROP COLUMN timeslot` on
  `booking_occurrences`. That generated column backs the `no_double_booking` exclusion
  constraint; Prisma cannot model it.
- Therefore **do not use `prisma migrate dev` or `prisma db push`** against this schema: both
  would drop `timeslot`. Generate SQL with `prisma migrate diff`, review it, remove the
  `timeslot` line, then `migrate deploy`.
- Before any write to the dev DB: back it up (`pg_dump` inside the container, see §10).

## 10. Safe local development commands

```bash
# from prototype-1/
docker compose up -d                          # start PostgreSQL
# from prototype-1/backend/
npx prisma migrate status                     # read-only: is the DB up to date?
npx prisma migrate deploy                     # apply pending migrations (non-destructive)
npx prisma generate                           # regenerate the client after schema changes
npm run db:seed                               # idempotent seed (safe to re-run)
npm run test:prepare                          # create/migrate/seed the isolated labsync_test DB
npm test                                      # tests run against labsync_test only
docker exec labsync-postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > backup.sql   # backup (never commit it)
```

Never run: `prisma migrate reset`, `prisma migrate dev`, `prisma db push`, `deleteMany` on shared tables.

## 11. Verification queries

Run with `psql` against the dev DB (read-only):

```sql
-- catalog present, with provenance
SELECT count(*) FROM courses WHERE catalog_source = 'cedt-google-forms';          -- 36
-- legacy placeholders kept and still used by bookings
SELECT c.code, count(b.id) FROM courses c LEFT JOIN bookings b ON b.course_id = c.id
 WHERE c.catalog_source IS NULL GROUP BY c.code;
-- synthetic enrollments per student
SELECT u.email, count(*) FROM enrollments e JOIN users u ON u.id = e.student_id
 WHERE e.source = 'synthetic-demo' GROUP BY u.email;                               -- 6 / 5 / 6
-- every catalog course announced for the active term
SELECT count(*) FROM allowed_courses a JOIN courses c ON c.id = a.course_id
 JOIN terms t ON t.id = a.term_id WHERE t.is_active AND c.catalog_source IS NOT NULL; -- 36
-- no duplicate live requests (must return 0 rows)
SELECT student_id, course_id, term_id, count(*) FROM course_change_requests
 WHERE status IN ('pending_approval','processing','completed')
 GROUP BY 1,2,3 HAVING count(*) > 1;
-- windows do not overlap (must return 0)
SELECT count(*) FROM course_change_windows a JOIN course_change_windows b
  ON a.term_id = b.term_id AND a.request_type = b.request_type AND a.id < b.id
 AND a.week_from <= b.week_to AND b.week_from <= a.week_to;
```

## 12. Known limitations

1. **Enrollments are synthetic.** No Reg Chula import exists; sections and credits are unknown (NULL).
2. **Drop vs. withdraw course lists are merged** — need the per-form lists to set `allow_drop` / `allow_withdraw` per course.
3. ~~8 pre-DATA-001 requests reference placeholder courses~~ — **resolved in DEMO-002**: with Product Owner authorization those 8 requests plus the DATA-001 verification request CR-2026-00027 were deleted (with their 28 events and 23 notifications) in one guarded transaction after a verified backup. No Course Change request references a placeholder course any more.
4. The 36 catalog courses now also appear in LabSync's booking course typeahead and Master Data course list (shared table — intended reuse, but visible to booking users).
5. No `credits` on `courses`; no "Other" course option (Google Forms has one).
6. Window overlap and audit-log immutability are not enforced by the DB.
7. LabSync's own `booking-flow.test.ts` passes on a freshly seeded test DB but its BR-8 case fails on re-runs (it consumes its seeded booking) — pre-existing; needs a test-DB reset step (backlog TEST-001).

## DATA-001 verification record (2026-10-09)

| Check | Result |
|---|---|
| Docker PostgreSQL reachable, Prisma connects | ✅ `pg_isready`, `migrate status` |
| Schema matches DB | ✅ `migrate diff` shows only the known `timeslot` artefact |
| Catalog / enrollments / announcements in dev DB | ✅ 36 / 17 new / 36 new; second seed run created 0 |
| Unrelated records preserved | ✅ users 8 → 8, bookings 15 → 15, placeholder courses kept |
| Tests (isolated `labsync_test`) | ✅ 58/58 on fresh DB; Course Change 45/45 on 3 consecutive runs |
| Student → Staff → Student with real codes (browser) | ✅ CR-2026-00027, 2110423 วิศวกรรมซอฟต์แวร์, approved, student sees `processing` |
| LabSync endpoints (calendar, bookings, courses, rooms, terms, users, notifications, public calendar) | ✅ all 200, 0 server errors |
