# Core Restructure (ขั้นที่ 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** จัดโครงสร้าง backend ตามแบบ B (schema หลายไฟล์ + รายชื่อโมดูล + `src/core/`) และเปลี่ยนชื่อ `StudentLayout` เป็น `PortalLayout` โดยไม่เปลี่ยนพฤติกรรมของระบบ

**Architecture:** แยก `prisma/schema.prisma` เป็น `prisma/schema/*.prisma` ด้วยสคริปต์ครั้งเดียว ให้แต่ละโมดูลมี `index.ts` ที่ export `AppModule` แล้ว `app.ts` วนเรียก `setup()` ของทุกโมดูลจาก `src/modules/index.ts` แทนการเขียน `register` ทีละบรรทัด

**Tech Stack:** Fastify 5, Prisma 6.19.3 (multi-file schema), Vitest 2, TypeScript 5, React + Vite (frontend)

**อ้างอิง:** [แผนของกลาง](2026-11-23-shared-backend-objects.md) หัวข้อ 2.2 และขั้นที่ 1 ในหัวข้อ 4

---

## ก่อนเริ่ม

- **ขั้นที่ 0 เสร็จแล้ว (23 พ.ย. 2026):** PR #3, #4, #5, #6, #8, #9 merge เข้า `main` แล้ว Task 5 จึงทำครบทุกโมดูล
- **การรัน test:** ใช้ `npm run test:fresh` ซึ่งสร้างฐานข้อมูลใช้ครั้งเดียว migrate, seed, รัน test แล้วลบทิ้ง ไม่แตะฐานข้อมูล dev (test บางตัวแก้ข้อมูล seed จึงรันซ้ำบนฐานข้อมูลเดิมไม่ได้) ห้ามใช้ `npm run db:reset` (Prisma บล็อกเมื่อ AI agent สั่ง)
- **เงื่อนไขของ PR นี้:** ไม่เปลี่ยนพฤติกรรม test เดิมผ่านทั้งหมด schema ที่ได้ต่างจากเดิมเป็นศูนย์ (`prisma migrate diff` ว่าง) และไม่มี migration ใหม่
- **ไม่อยู่ในขอบเขต:** ไม่ย้าย env ของโมดูลออกจาก `src/config.ts` (ยังคงชื่อเดิม เช่น `OCR_SERVICE_URL`) ไม่สร้างบริการใน `src/core/` (ทำในขั้นที่ 2 เป็นต้นไป)
- **ต่างจากแผนของกลางหัวข้อ 2.2:** โมดูล export `AppModule` ที่มีแค่ `name` และ `setup()` ส่วน `permissions` เพิ่มในขั้นที่ 5a และ env รายโมดูลค่อยแยกเมื่อมีความจำเป็น

## โครงไฟล์หลังทำเสร็จ

```
prototype-1/backend/
  package.json                      ← เพิ่ม "prisma": { "schema": "prisma/schema" }
  prisma/
    schema/
      _base.prisma                  ← generator + datasource
      core.prisma                   ← UserRole, User, Session, Course, Term, Notification, NotificationType, Enrollment
      bookings.prisma               ← Building, Room, Booking, BookingOccurrence, BookingEvent + enum
      announcements.prisma
      news.prisma  line.prisma  receipts.prisma  course-change.prisma   ← มาจาก PR ขั้นที่ 0
      migrations/                   ← ย้ายมาจาก prisma/migrations (Prisma หา migration ข้างไฟล์ที่มี datasource)
    seed.ts                         ← ไม่เปลี่ยน
  src/
    app.ts                          ← วนเรียก setup() ของทุกโมดูล
    core/README.md                  ← กติกาของ src/core/
    modules/
      types.ts                      ← AppModule, BuildOptions, API_PREFIX
      index.ts                      ← รายชื่อโมดูลตามลำดับที่ลงทะเบียน
      <module>/index.ts             ← export const <name>Module: AppModule
  test/modules.test.ts              ← ใหม่
prototype-1/frontend/src/
  features/portal/layout/PortalLayout.tsx   ← ย้ายจาก features/student/layout/StudentLayout.tsx
  app/router.tsx                    ← import ใหม่
```

---

### Task 1: สร้าง branch และวัดค่าตั้งต้น

**Files:** ไม่มี

- [ ] **Step 1: สร้าง branch จาก `main` ล่าสุด**

```bash
git switch main
git pull
git switch -c core/restructure
```

- [ ] **Step 2: ติดตั้งและอัปเดตฐานข้อมูล dev**

Postgres ต้องเปิดอยู่ และ `.env` มี `DATABASE_URL` ที่ใช้ได้

```bash
cd prototype-1/backend
npm ci
npx prisma migrate deploy
```

Expected: `All migrations have been successfully applied.` (หรือ `No pending migrations to apply.`)

- [ ] **Step 3: รัน test และ typecheck ตั้งต้น**

```bash
npm run test:fresh
npx tsc --noEmit
```

Expected: `Test Files  25 passed (25)` และ `Tests  282 passed (282)` และ `tsc` ไม่มี error

- [ ] **Step 4: เก็บสำเนา schema เดิมไว้นอก repo**

```bash
cp prisma/schema.prisma "${TMPDIR:-/tmp}/schema-before.prisma"
```

---

### Task 2: แยก schema เป็นหลายไฟล์

**Files:**
- Create: `prototype-1/backend/prisma/schema/_base.prisma`, `core.prisma`, `bookings.prisma`, `announcements.prisma` และไฟล์ของโมดูลจากขั้นที่ 0
- Move: `prototype-1/backend/prisma/migrations/` → `prototype-1/backend/prisma/schema/migrations/`
- Delete: `prototype-1/backend/prisma/schema.prisma`
- Modify: `prototype-1/backend/package.json`

- [ ] **Step 1: สร้างสคริปต์แยก schema นอก repo**

บันทึกเป็น `${TMPDIR:-/tmp}/split-schema.mjs` (ไม่ commit) สคริปต์นี้ทดสอบแล้วกับ schema ของ `main` และของ PR #3, #4, #6, #8 ทุกตัวได้ diff ว่างและเก็บ comment ครบ

```js
// One-off: split prisma/schema.prisma into prisma/schema/*.prisma by module.
// Usage (from prototype-1/backend): node split-schema.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const SOURCE = process.argv[2] ?? "prisma/schema.prisma";
const OUT_DIR = process.argv[3] ?? "prisma/schema";

/** Block name -> file. Every model/enum must be listed; unknown names stop the script. */
const FILE_OF = {
  generator: "_base",
  datasource: "_base",
  // core: shared objects (plan section 1.1)
  UserRole: "core", User: "core", Session: "core", Course: "core", Term: "core",
  Notification: "core", NotificationType: "core", Enrollment: "core",
  // bookings (rooms and buildings are booking master data)
  RoomType: "bookings", BookingStatus: "bookings", BookingType: "bookings", EventType: "bookings",
  Building: "bookings", Room: "bookings", Booking: "bookings",
  BookingOccurrence: "bookings", BookingEvent: "bookings",
  // announcements and news
  AnnouncementStatus: "announcements", AnnouncementAudience: "announcements", Announcement: "announcements",
  NewsStatus: "news", NewsTag: "news", NewsArticle: "news", NewsImage: "news",
  // modules merged in step 0
  LineLinkToken: "line", LineWebhookEvent: "line",
  ReceiptCheck: "receipts",
  AllowedCourse: "course-change",
};
const fileOf = (kind, name) =>
  FILE_OF[kind === "generator" || kind === "datasource" ? kind : name] ??
  (name.startsWith("CourseChange") ? "course-change" : undefined);

const lines = readFileSync(SOURCE, "utf8").replace(/\r\n/g, "\n").split("\n");
const files = new Map();
const unknown = [];
let pending = []; // comment lines directly above the next block

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const head = line.match(/^(model|enum|generator|datasource|view|type)\s+(\w+)\s*\{/);
  if (!head) {
    if (/^\s*(\/\/|\/\*|\*)/.test(line)) pending.push(line);
    else if (line.trim() === "") pending = pending.length ? [...pending, line] : [];
    else throw new Error(`Unexpected top-level line ${i + 1}: ${line}`);
    continue;
  }
  const block = [...pending.filter((l, j, a) => l.trim() !== "" || j < a.length - 1), line];
  pending = [];
  while (lines[i] !== "}") block.push(lines[++i]);
  const file = fileOf(head[1], head[2]);
  if (!file) unknown.push(`${head[1]} ${head[2]}`);
  else files.set(file, [...(files.get(file) ?? []), block.join("\n")]);
}

if (unknown.length) {
  console.error(`Add these to FILE_OF before splitting:\n  ${unknown.join("\n  ")}`);
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const [file, blocks] of files) {
  writeFileSync(`${OUT_DIR}/${file}.prisma`, blocks.join("\n\n") + "\n");
  console.log(`${OUT_DIR}/${file}.prisma: ${blocks.length} blocks`);
}
```

- [ ] **Step 2: รันสคริปต์**

```bash
node "${TMPDIR:-/tmp}/split-schema.mjs"
```

Expected (เมื่อ merge PR ขั้นที่ 0 ครบ): มีไฟล์ `_base`, `core` (8 blocks), `bookings` (9), `announcements` (3), `news` (4), `line` (2), `receipts` (1), `course-change` (12) ถ้าสคริปต์บอก `Add these to FILE_OF` แปลว่ามี model ใหม่ที่ยังไม่ได้จัด ให้เพิ่มชื่อใน `FILE_OF` ตามโมดูลเจ้าของ แล้วรันใหม่

- [ ] **Step 3: ตรวจว่า schema ใหม่เท่ากับของเดิมทุกตัวอักษรในแง่ฐานข้อมูล**

```bash
npx prisma validate --schema prisma/schema
npx prisma migrate diff --from-schema-datamodel "${TMPDIR:-/tmp}/schema-before.prisma" --to-schema-datamodel prisma/schema --exit-code --script
```

Expected: `validate` บอกว่า valid และ `migrate diff` พิมพ์ `-- This is an empty migration.` พร้อม exit code 0 (ถ้าได้ 2 แปลว่ามีอะไรเปลี่ยน ห้ามไปต่อ)

- [ ] **Step 4: ลบไฟล์เดิม ย้าย migration และบอก Prisma ว่า schema อยู่ไหน**

```bash
git rm prisma/schema.prisma
git mv prisma/migrations prisma/schema/migrations
```

แก้ `package.json` ส่วน `prisma` เป็น

```json
  "prisma": {
    "schema": "prisma/schema",
    "seed": "tsx --env-file=.env prisma/seed.ts"
  },
```

- [ ] **Step 5: จัดรูปแบบและ generate client**

```bash
npx prisma format
npx prisma generate
```

Expected: `Prisma schema loaded from prisma\schema` และ `Generated Prisma Client`

- [ ] **Step 6: ตรวจว่า Prisma เจอ migration ที่ย้ายแล้ว**

```bash
npx prisma migrate status
```

Expected: `N migrations found in prisma/schema/migrations` และ `Database schema is up to date!` ถ้าขึ้น `No migration found` แปลว่าโฟลเดอร์ไม่ได้อยู่ข้าง `_base.prisma`

- [ ] **Step 7: รัน test และ typecheck**

```bash
npm run test:fresh
npx tsc --noEmit
```

Expected: ผ่านทั้งหมด จำนวน test เท่ากับ Task 1

- [ ] **Step 8: Commit**

```bash
git add package.json prisma/
git commit -m "refactor(db): split Prisma schema into one file per module"
```

---

### Task 3: รายชื่อโมดูล (`AppModule`) สำหรับโมดูลบน `main`

**Files:**
- Create: `prototype-1/backend/src/modules/types.ts`
- Create: `prototype-1/backend/src/modules/index.ts`
- Create: `prototype-1/backend/src/modules/{auth,announcements,calendar,bookings,masterdata,notifications,import}/index.ts`
- Modify: `prototype-1/backend/src/app.ts`
- Test: `prototype-1/backend/test/modules.test.ts`

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

`test/modules.test.ts`:

```ts
import type { FastifyInstance, HTTPMethods } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { modules } from "../src/modules/index.js";

/** One known route per module: proves app.ts registers every module under /api/v1. */
const SAMPLE_ROUTES: Record<string, [HTTPMethods, string]> = {
  auth: ["POST", "/api/v1/auth/login"],
  announcements: ["GET", "/api/v1/announcements"],
  calendar: ["GET", "/api/v1/calendar"],
  bookings: ["GET", "/api/v1/bookings"],
  masterdata: ["GET", "/api/v1/rooms"],
  notifications: ["GET", "/api/v1/notifications"],
  import: ["POST", "/api/v1/import/courses"],
};

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("module registry", () => {
  it("lists every module once", () => {
    const names = modules.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.sort()).toEqual(Object.keys(SAMPLE_ROUTES).sort());
  });

  it("registers each module's routes under /api/v1", () => {
    for (const [name, [method, url]] of Object.entries(SAMPLE_ROUTES)) {
      expect(app.hasRoute({ method, url }), `${name}: ${method} ${url}`).toBe(true);
    }
  });
});
```

- [ ] **Step 2: รัน test ให้เห็นว่าไม่ผ่าน**

```bash
npx vitest run test/modules.test.ts
```

Expected: FAIL เพราะ import `../src/modules/index.js` ไม่เจอ

- [ ] **Step 3: สร้าง `src/modules/types.ts`**

```ts
import type { FastifyInstance } from "fastify";

/** Every module's routes live under this prefix. */
export const API_PREFIX = "/api/v1";

/**
 * Options passed to buildApp(). Tests use them to swap out external services;
 * a module that needs an override adds its own optional field here.
 */
export interface BuildOptions {}

export interface AppModule {
  /** Module name: the prefix of its permissions, notification types, audit actions and env vars. */
  name: string;
  /** Registers the module's routes (under API_PREFIX) and starts any background work. */
  setup(app: FastifyInstance, opts: BuildOptions): Promise<void>;
}
```

- [ ] **Step 4: สร้าง `index.ts` ของแต่ละโมดูล**

`src/modules/auth/index.ts`:

```ts
import { API_PREFIX, type AppModule } from "../types.js";
import { authRoutes } from "./routes.js";

export const authModule: AppModule = {
  name: "auth",
  async setup(app) {
    await app.register(authRoutes, { prefix: API_PREFIX });
  },
};
```

`src/modules/announcements/index.ts`:

```ts
import { API_PREFIX, type AppModule } from "../types.js";
import { announcementRoutes } from "./routes.js";

export const announcementsModule: AppModule = {
  name: "announcements",
  async setup(app) {
    await app.register(announcementRoutes, { prefix: API_PREFIX });
  },
};
```

`src/modules/calendar/index.ts`:

```ts
import { API_PREFIX, type AppModule } from "../types.js";
import { calendarRoutes } from "./routes.js";

export const calendarModule: AppModule = {
  name: "calendar",
  async setup(app) {
    await app.register(calendarRoutes, { prefix: API_PREFIX });
  },
};
```

`src/modules/bookings/index.ts`:

```ts
import { API_PREFIX, type AppModule } from "../types.js";
import { bookingRoutes } from "./routes.js";

export const bookingsModule: AppModule = {
  name: "bookings",
  async setup(app) {
    await app.register(bookingRoutes, { prefix: API_PREFIX });
  },
};
```

`src/modules/masterdata/index.ts`:

```ts
import { API_PREFIX, type AppModule } from "../types.js";
import { masterDataRoutes } from "./routes.js";

export const masterdataModule: AppModule = {
  name: "masterdata",
  async setup(app) {
    await app.register(masterDataRoutes, { prefix: API_PREFIX });
  },
};
```

`src/modules/notifications/index.ts`:

```ts
import { API_PREFIX, type AppModule } from "../types.js";
import { notificationRoutes } from "./routes.js";

export const notificationsModule: AppModule = {
  name: "notifications",
  async setup(app) {
    await app.register(notificationRoutes, { prefix: API_PREFIX });
  },
};
```

`src/modules/import/index.ts`:

```ts
import { API_PREFIX, type AppModule } from "../types.js";
import { importRoutes } from "./routes.js";

export const importModule: AppModule = {
  name: "import",
  async setup(app) {
    await app.register(importRoutes, { prefix: API_PREFIX });
  },
};
```

`src/modules/conflicts/` ไม่มี route เป็นแค่โค้ดที่ bookings ใช้ จึงไม่ต้องมี `index.ts`

- [ ] **Step 5: สร้าง `src/modules/index.ts`**

ลำดับเดียวกับที่ `app.ts` ลงทะเบียนอยู่เดิม

```ts
import { announcementsModule } from "./announcements/index.js";
import { authModule } from "./auth/index.js";
import { bookingsModule } from "./bookings/index.js";
import { calendarModule } from "./calendar/index.js";
import { importModule } from "./import/index.js";
import { masterdataModule } from "./masterdata/index.js";
import { notificationsModule } from "./notifications/index.js";
import type { AppModule } from "./types.js";

/** Every module, in registration order. Adding a module is one line here. */
export const modules: AppModule[] = [
  authModule,
  announcementsModule,
  calendarModule,
  bookingsModule,
  masterdataModule,
  notificationsModule,
  importModule,
];
```

- [ ] **Step 6: แก้ `src/app.ts` ให้วนลงทะเบียน**

```ts
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";
import { config } from "./config.js";
import { modules } from "./modules/index.js";
import type { BuildOptions } from "./modules/types.js";
import { registerAuth } from "./plugins/auth.js";
import { registerErrorHandler } from "./plugins/errors.js";

export type { BuildOptions } from "./modules/types.js";

export async function buildApp(opts: BuildOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.NODE_ENV === "test" ? false : { level: "info" },
  });

  await app.register(cors, { origin: config.APP_ORIGIN, credentials: true });
  await app.register(cookie);
  await app.register(multipart);

  registerErrorHandler(app);
  registerAuth(app);

  app.get("/health", { config: { auth: "public" } }, async () => ({ ok: true }));

  for (const mod of modules) {
    await mod.setup(app, opts);
  }

  return app;
}
```

ถ้า `app.ts` บน `main` หลังขั้นที่ 0 มีโค้ดของ LINE อยู่ (เช่น `BuildOptions`, `lineDryRun`, `startLineDispatcher`) โค้ดเหล่านั้นย้ายไป Task 5 ไม่ต้องเก็บไว้ที่นี่

- [ ] **Step 7: รัน test**

```bash
npx vitest run test/modules.test.ts
npm run test:fresh
npx tsc --noEmit
```

Expected: `module registry` ผ่านสอง test และ test เดิมผ่านทั้งหมด (ถ้าขั้นที่ 0 merge แล้ว test ของ LINE, receipts, course change และ news จะ fail จนกว่าจะทำ Task 5 เสร็จ ทำ Task 5 ต่อก่อน commit)

- [ ] **Step 8: Commit**

```bash
git add src/app.ts src/modules test/modules.test.ts
git commit -m "refactor(api): register modules from a single module list"
```

---

### Task 4: กติกาของ `src/core/`

**Files:**
- Create: `prototype-1/backend/src/core/README.md`

- [ ] **Step 1: สร้าง README**

```markdown
# src/core

บริการของกลางที่ทุกโมดูลใช้ร่วมกัน (ดูแผนของกลาง หัวข้อ 2.3)

- เขียนตารางกลางผ่านบริการในโฟลเดอร์นี้เท่านั้น เช่น `notify()`, `audit()`, `saveFile()`, `can()`
- ทุกบริการรับ `tx` เพื่อทำงานใน transaction เดียวกับงานของโมดูล
- โค้ดในนี้ห้าม import จาก `src/modules/`
- ทุกบริการมี test ของตัวเองใน `test/core/`
- PR ที่แก้โฟลเดอร์นี้หรือ `prisma/schema/core.prisma` ติด label `shared`
```

- [ ] **Step 2: Commit**

```bash
git add src/core/README.md
git commit -m "docs(core): add rules for shared services"
```

---

### Task 5: ย้ายโมดูลจาก PR ขั้นที่ 0 เข้า `AppModule`

ทำเฉพาะโมดูลที่ merge แล้ว ข้ามส่วนที่ยังไม่ merge

**Files:**
- Create: `prototype-1/backend/src/modules/{line,receipts,course-change,news}/index.ts`
- Modify: `prototype-1/backend/src/modules/types.ts` (เพิ่ม `lineClient`)
- Modify: `prototype-1/backend/src/modules/index.ts`
- Modify: `prototype-1/backend/test/modules.test.ts`

- [ ] **Step 1: เพิ่ม route ตัวอย่างใน test**

เพิ่มใน `SAMPLE_ROUTES` ของ `test/modules.test.ts` (เฉพาะโมดูลที่ merge แล้ว)

```ts
  line: ["POST", "/api/v1/line/webhook"],
  receipts: ["GET", "/api/v1/receipts"],
  course_change: ["GET", "/api/v1/course-change/requests"],
  news: ["GET", "/api/v1/news"],
```

path เหล่านี้ตรวจจาก branch ของ PR แล้ว ถ้า PR เปลี่ยน path ก่อน merge ให้แก้ตาม `src/modules/<module>/routes.ts`

- [ ] **Step 2: รัน test ให้เห็นว่าไม่ผ่าน**

```bash
npx vitest run test/modules.test.ts
```

Expected: FAIL ที่ `lists every module once` เพราะ `modules` ยังไม่มีโมดูลใหม่

- [ ] **Step 3: LINE (PR #3)**

เพิ่ม `lineClient` ใน `src/modules/types.ts` แทน interface ว่างเดิม

```ts
import type { LineClient } from "./line/client.js";

export interface BuildOptions {
  /** Tests pass a fake LINE client so no request leaves the process. */
  lineClient?: LineClient;
}
```

`src/modules/line/index.ts` ย้ายโค้ด LINE ที่เคยอยู่ใน `app.ts` มาไว้ที่นี่ทั้งหมด

```ts
import { config, lineDryRun } from "../../config.js";
import { prisma } from "../../db.js";
import { API_PREFIX, type AppModule } from "../types.js";
import { createDryRunLineClient, createLineClient } from "./client.js";
import { startLineDispatcher } from "./dispatcher.js";
import { lineRoutes } from "./routes.js";

export const lineModule: AppModule = {
  name: "line",
  async setup(app, opts) {
    // LINE_DRY_RUN: prints each message to this console instead of sending it (see createDryRunLineClient).
    const dryRunClient = lineDryRun ? createDryRunLineClient(app.log) : undefined;
    if (lineDryRun) app.log.warn("LINE is in dry-run mode: nothing is sent; replies and pushes are printed here");

    await app.register(lineRoutes, { prefix: API_PREFIX, client: opts.lineClient ?? dryRunClient });

    // Starts on ready only when LINE is enabled and not under test (see startLineDispatcher).
    startLineDispatcher(app, {
      prisma,
      client: opts.lineClient ?? dryRunClient ?? createLineClient(config.LINE_CHANNEL_ACCESS_TOKEN ?? ""),
      appOrigin: config.APP_ORIGIN,
      intervalMs: config.LINE_DISPATCH_INTERVAL_MS,
    });
  },
};
```

เทียบกับ `app.ts` ของ PR #3 อีกครั้งว่าย้ายมาครบ ถ้า PR แก้โค้ดส่วนนี้หลังเขียนแผน ให้ยึดโค้ดใน PR แล้วย้ายมาแบบเดียวกัน

- [ ] **Step 4: receipts (PR #4)**

`src/modules/receipts/index.ts`:

```ts
import { API_PREFIX, type AppModule } from "../types.js";
import { receiptRoutes } from "./routes.js";

export const receiptsModule: AppModule = {
  name: "receipts",
  async setup(app) {
    await app.register(receiptRoutes, { prefix: API_PREFIX });
  },
};
```

- [ ] **Step 5: course change (PR #6)**

`src/modules/course-change/index.ts`:

```ts
import { API_PREFIX, type AppModule } from "../types.js";
import { courseChangeRoutes } from "./routes.js";

export const courseChangeModule: AppModule = {
  name: "course_change",
  async setup(app) {
    await app.register(courseChangeRoutes, { prefix: API_PREFIX });
  },
};
```

- [ ] **Step 6: news (PR #8)**

`src/modules/news/index.ts`:

```ts
import { API_PREFIX, type AppModule } from "../types.js";
import { newsRoutes } from "./routes.js";

export const newsModule: AppModule = {
  name: "news",
  async setup(app) {
    await app.register(newsRoutes, { prefix: API_PREFIX });
  },
};
```

- [ ] **Step 7: เพิ่มใน `src/modules/index.ts`**

ใส่ import และต่อท้ายรายการตามลำดับที่ PR เคยลงทะเบียนใน `app.ts` (ดูด้วย `git show main:prototype-1/backend/src/app.ts`) เช่น

```ts
import { courseChangeModule } from "./course-change/index.js";
import { lineModule } from "./line/index.js";
import { newsModule } from "./news/index.js";
import { receiptsModule } from "./receipts/index.js";

export const modules: AppModule[] = [
  authModule,
  announcementsModule,
  newsModule,
  calendarModule,
  bookingsModule,
  masterdataModule,
  notificationsModule,
  importModule,
  lineModule,
  receiptsModule,
  courseChangeModule,
];
```

- [ ] **Step 8: รัน test ทั้งหมด**

```bash
npm run test:fresh
npx tsc --noEmit
```

Expected: ผ่านทั้งหมด รวม test ของ LINE (`test/line/*`), receipts, course change และ news ที่ส่ง `lineClient` ผ่าน `buildApp({ lineClient })` เหมือนเดิม

- [ ] **Step 9: Commit**

```bash
git add src/modules test/modules.test.ts
git commit -m "refactor(api): move step-0 modules into the module list"
```

---

### Task 6: เปลี่ยนชื่อ `StudentLayout` เป็น `PortalLayout` (frontend)

layout นี้ใช้ทั้งนิสิตและอาจารย์ (เช่น หน้าจองห้อง) ชื่อเดิมทำให้เข้าใจผิด

**Files:**
- Move: `prototype-1/frontend/src/features/student/layout/StudentLayout.tsx` → `prototype-1/frontend/src/features/portal/layout/PortalLayout.tsx`
- Modify: `prototype-1/frontend/src/app/router.tsx`

- [ ] **Step 1: ย้ายไฟล์**

```bash
cd ../frontend
mkdir -p src/features/portal/layout
git mv src/features/student/layout/StudentLayout.tsx src/features/portal/layout/PortalLayout.tsx
```

- [ ] **Step 2: เปลี่ยนชื่อในไฟล์**

ใน `PortalLayout.tsx` เปลี่ยน

```tsx
const STUDENT_TOPBAR_ITEMS: TopbarItem[] = [
```

เป็น

```tsx
const PORTAL_TOPBAR_ITEMS: TopbarItem[] = [
```

และ

```tsx
export function StudentLayout() {
```

เป็น

```tsx
export function PortalLayout() {
```

และทุกที่ที่ใช้ `STUDENT_TOPBAR_ITEMS` ในไฟล์เดียวกันเป็น `PORTAL_TOPBAR_ITEMS`

- [ ] **Step 3: แก้ router**

ใน `src/app/router.tsx` เปลี่ยน

```tsx
import { StudentLayout } from "@/features/student/layout/StudentLayout";
```

เป็น

```tsx
import { PortalLayout } from "@/features/portal/layout/PortalLayout";
```

และ `<Route element={<StudentLayout />}>` เป็น `<Route element={<PortalLayout />}>`

- [ ] **Step 4: ตรวจว่าไม่เหลือชื่อเดิม**

```bash
grep -rn "StudentLayout\|STUDENT_TOPBAR_ITEMS" src
```

Expected: ไม่มีผลลัพธ์ ถ้ามี (เช่น PR ที่ merge ในขั้นที่ 0 import ไว้) ให้เปลี่ยนเป็นชื่อใหม่

- [ ] **Step 5: typecheck และ build**

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Expected: ไม่มี error

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "refactor(web): rename StudentLayout to PortalLayout"
```

---

### Task 7: ตรวจรอบสุดท้ายและเปิด PR

**Files:** ไม่มี

- [ ] **Step 1: ตรวจ backend จากฐานข้อมูลเปล่า**

```bash
cd ../backend
npm run test:fresh
npx prisma migrate status
npx tsc --noEmit
npx prisma migrate diff --from-schema-datamodel "${TMPDIR:-/tmp}/schema-before.prisma" --to-schema-datamodel prisma/schema --exit-code --script
```

Expected:
- `test:fresh` ใช้ migration จาก `prisma/schema/migrations` ครบ seed สำเร็จ และ test ผ่านทั้งหมด จำนวนเท่ากับ Task 1 บวก 2 (`module registry`)
- `migrate status` บอก `Database schema is up to date!`
- `tsc` ไม่มี error
- `migrate diff` ได้ `-- This is an empty migration.` exit code 0

- [ ] **Step 2: ลองเปิดแอป**

```bash
npm run dev
```

Expected: log `LabSync API listening on http://localhost:3000/api/v1` และ `curl http://localhost:3000/health` ได้ `{"ok":true}` จากนั้นหยุด dev server

- [ ] **Step 3: ตรวจว่าไม่มี migration ใหม่**

```bash
git diff --stat main -- prisma/schema/migrations | tail -1
```

Expected: มีแต่การย้ายไฟล์ (rename) ไม่มีโฟลเดอร์ migration ใหม่

- [ ] **Step 4: push และเปิด PR**

```bash
git push -u origin core/restructure
gh pr create --title "Core restructure: split schema and module list (no behavior change)" --label shared --body "$(cat <<'EOF'
ขั้นที่ 1 ของแผนของกลาง: จัดโครงสร้างโดยไม่เปลี่ยนพฤติกรรม

- แยก `prisma/schema.prisma` เป็น `prisma/schema/*.prisma` ตามโมดูล และย้าย migration ไป `prisma/schema/migrations`
- ทุกโมดูลมี `index.ts` ที่ export `AppModule` และ `app.ts` ลงทะเบียนจาก `src/modules/index.ts`
- โค้ด LINE ที่เคยอยู่ใน `app.ts` ย้ายไป `src/modules/line/index.ts`
- เพิ่ม `src/core/README.md`
- frontend: `StudentLayout` → `PortalLayout`

ตรวจแล้ว
- test เดิมผ่านทั้งหมด + test ใหม่ `module registry`
- `prisma migrate diff` จาก schema เดิมเป็น schema ใหม่ว่าง ไม่มี migration ใหม่

หลัง merge: ทุก PR ที่เปิดอยู่ต้อง rebase โมดูลใหม่เพิ่มไฟล์ `prisma/schema/<module>.prisma` และหนึ่งบรรทัดใน `src/modules/index.ts`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: แจ้งทีม**

แจ้งในกลุ่มว่า PR ที่เปิดอยู่ (เช่น #5 storage, #9) ต้อง rebase หลัง merge และวิธีเพิ่มโมดูลใหม่:
1. สร้าง `prisma/schema/<module>.prisma`
2. สร้าง `src/modules/<module>/index.ts` ที่ export `AppModule`
3. เพิ่มหนึ่งบรรทัดใน `src/modules/index.ts`
