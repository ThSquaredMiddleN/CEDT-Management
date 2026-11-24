# Core Files (ขั้นที่ 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ตาราง `files` ของกลาง + `fileStore` (driver `local` และ `supabase`) แล้วย้าย PDF ของลด-ถอนรายวิชาออกจาก bytea และรูปข่าวออกจากดิสก์ของโมดูลข่าวมาใช้ที่เดียวกัน

**Architecture:** เนื้อไฟล์อยู่นอกฐานข้อมูล ใน `fileStore` ที่เลือก driver ด้วย env `FILE_STORAGE` แถวใน `files` เก็บ storage key, ชื่อ, ชนิด, ขนาด, sha256, โมดูล และผู้อัปโหลด ตารางของโมดูลอ้าง `files` ด้วย `file_id` บริการ `src/core/files.ts` อัปโหลดก่อนแล้วจึงเขียนแถวใน transaction ของโมดูล และ `withFileTransaction()` ลบไฟล์ที่อัปโหลดไปแล้วเมื่อ transaction ล้ม สคริปต์ sweep ลบไฟล์ที่ไม่มีแถวและอายุเกินหนึ่งวัน การดาวน์โหลดผ่าน route เดิมของแต่ละโมดูลที่ตรวจสิทธิ์อยู่แล้ว

**Tech Stack:** Fastify 5, Prisma 6.19.3 (multi-file schema), PostgreSQL 17, zod 4, Vitest, Node `fetch` (Supabase Storage REST API ไม่ใช้ supabase-js)

**อ้างอิง:** [แผนของกลาง](2026-11-23-shared-backend-objects.md) หัวข้อ 2.1, 2.3, 2.9, 3.7, ขั้นที่ 6 และ [คู่มือ deploy](../../deploy/render-supabase-vercel.md)

---

## ก่อนเริ่ม

- **branch:** `core/files` แตกจาก `main` ที่ `2c17183` (หลัง #16, #17) ใน checkout หลัก `C:\CEDT\CEDT-Management` (ไม่ใช้ worktree) PR ติด label `shared`
- **รัน test:** `npm run test:fresh` (ไฟล์เดียว `npm run test:fresh -- test/core/files.test.ts`) ห้าม `npm run db:reset` หรือ `prisma migrate reset` booking-flow BR-14 fail อยู่แล้วเพราะวันที่ใน seed
- **migration:** สร้าง SQL ด้วย `prisma migrate diff` ก่อนแล้วจึงสร้างโฟลเดอร์ ลบบรรทัด `ALTER TABLE "booking_occurrences" DROP COLUMN "timeslot";` ที่ diff ใส่มาเสมอ ถ้า PR อื่น (#18, #19) merge ก่อน ให้ rebase แล้วเปลี่ยน timestamp ให้ใหม่กว่า
- **ตัดสินในแผนนี้:**
  - ใช้ `fetch` เรียก Supabase Storage REST API ตรง ไม่เพิ่ม dependency และทดสอบด้วย fetch ปลอม (ยังไม่มี bucket จริง ทดสอบจริงตอน deploy)
  - storage key = `<ปี>/<เดือน>/<uuid>` ไม่มีชื่อไฟล์ของผู้ใช้ใน key
  - `readFile()` คืน `Buffer` ไม่ใช่ stream (ไฟล์ใหญ่สุด 10 MB)
  - ตาราง `course_change_files` คง `filename`, `sha256` และ `news_images` คง `original_name`, `mime_type`, `size_bytes` ไว้ (API ใช้อยู่) เปลี่ยนเฉพาะที่เก็บเนื้อไฟล์เป็น `file_id`
  - migration สองขั้น: ขั้นแรกเพิ่ม `files` และ `file_id` (ว่างได้) ขั้นที่สองลบคอลัมน์เดิมและบังคับ `file_id` โดยมี guard ที่ปฏิเสธถ้ายังมีแถวที่ไม่ได้ย้าย ฐานข้อมูลใหม่ (test, Supabase ที่ seed ใหม่) ผ่านทั้งสองขั้นทันที ฐานข้อมูลเดิมที่มีข้อมูลต้องรัน `npm run files:backfill` ระหว่างสองขั้น (Task F8)
  - `withFileTransaction()` ตั้ง timeout 30 วินาที เพราะการอัปโหลดไป Supabase เกิดใน transaction และ default ของ Prisma คือ 5 วินาที
  - ลบแถว `files` ใน transaction แล้วลบเนื้อไฟล์หลัง commit (ถ้าลบไม่สำเร็จ sweep จะเก็บเอง)
- **ไม่อยู่ในขอบเขต:** รูปอุปกรณ์ของ storage (รอ backend ของ storage), ใบเสร็จ (ไม่ได้เก็บไฟล์), ลิงก์ดาวน์โหลดแบบ signed URL, ปรับคู่มือ deploy (ทำหลัง merge)

## โครงไฟล์

```
prototype-1/backend/
  .gitignore                                  ← F2: storage/
  .env.example                                ← F2: FILE_STORAGE, SUPABASE_*
  vitest.config.ts                            ← F2: test ใช้ local เสมอ
  scripts/test-fresh.ts                       ← F2: โฟลเดอร์ไฟล์แยกต่อรอบ
  src/config.ts                               ← F2
  src/core/file-store.ts                      ← F3: FileStore, createLocalStore, createSupabaseStore, newStorageKey, fileStore
  prisma/schema/core.prisma                   ← F4: model File
  prisma/schema/course-change.prisma          ← F4, F8
  prisma/schema/news.prisma                   ← F4, F8
  prisma/schema/migrations/20261125140000_files/
  prisma/schema/migrations/20261125140100_files_drop_legacy/   ← F8
  src/core/files.ts                           ← F5: saveFile, withFileTransaction, readFile, deleteFileRecord, removeStoredFile
  src/core/README.md                          ← F10
  src/modules/course-change/workflow.ts       ← F6: uploadFile, mergeFiles, downloadFile
  src/modules/course-change/routes.ts         ← F6
  scripts/demo-reset.ts                       ← F6
  src/modules/news/service.ts, routes.ts      ← F7
  src/modules/news/storage.ts                 ← F7: ลบ
  scripts/files-backfill.ts                   ← F8
  scripts/files-sweep.ts                      ← F9
  package.json                                ← F8, F9: files:backfill, files:sweep
  test/core/file-store.test.ts                ← F3
  test/core/files-config.test.ts              ← F2
  test/core/files.test.ts                     ← F5, F9
  test/news-images.test.ts                    ← F7
  test/course-change-workflow.test.ts         ← F6
```

---

### Task F1: ตรวจจุดเริ่ม

- [ ] **Step 1: ยืนยัน branch และ test เดิม**

```bash
cd C:/CEDT/CEDT-Management
git status --short          # มีแค่ไฟล์ที่ไม่ได้ commit: .claude/, docs/deploy/, docs/superpowers/
git branch --show-current   # core/files
git log --oneline -1        # 2c17183 Merge pull request #17 ...
cd prototype-1/backend && npm ci && npx prisma generate && npx tsc --noEmit && npm run test:fresh
```

Expected: tsc ผ่าน, test ผ่านทั้งหมดยกเว้น BR-14

---

### Task F2: config ของ fileStore

**Files:**
- Modify: `prototype-1/backend/src/config.ts`
- Modify: `prototype-1/backend/.gitignore`, `prototype-1/backend/.env.example`, `prototype-1/backend/vitest.config.ts`, `prototype-1/backend/scripts/test-fresh.ts`
- Test: `prototype-1/backend/test/core/files-config.test.ts`

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

`test/core/files-config.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

const load = () => import("../../src/config.js");

describe("file storage config", () => {
  it("defaults to the local driver in ./storage", async () => {
    vi.stubEnv("FILE_STORAGE", "");
    vi.stubEnv("FILE_STORAGE_DIR", "");
    vi.resetModules();
    const { config } = await load();
    expect(config.FILE_STORAGE).toBe("local");
    expect(config.FILE_STORAGE_DIR).toBe("storage");
    expect(config.SUPABASE_STORAGE_BUCKET).toBe("files");
  });

  it("refuses the supabase driver without a URL and a service role key", async () => {
    vi.stubEnv("FILE_STORAGE", "supabase");
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.resetModules();
    await expect(load()).rejects.toThrow(/SUPABASE_URL/);
  });

  it("accepts the supabase driver when both are set", async () => {
    vi.stubEnv("FILE_STORAGE", "supabase");
    vi.stubEnv("SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key-for-tests");
    vi.resetModules();
    const { config } = await load();
    expect(config.FILE_STORAGE).toBe("supabase");
  });
});
```

```bash
npm run test:fresh -- test/core/files-config.test.ts
```

Expected: FAIL (`config.FILE_STORAGE` เป็น undefined)

- [ ] **Step 2: แก้ `src/config.ts`**

เพิ่มใน `schema` ต่อจาก `NEWS_UPLOAD_DIR`:

```ts
  // Where file contents live (shared plan 2.9). Rows in `files` hold the metadata.
  FILE_STORAGE: z.preprocess(emptyAsUnset, z.enum(["local", "supabase"]).default("local")),
  // local driver: folder for file contents (relative to the backend folder). Never served directly.
  FILE_STORAGE_DIR: z.preprocess(emptyAsUnset, z.string().default("storage")),
  // supabase driver: a PRIVATE bucket, reached only by the backend with the service role key.
  SUPABASE_URL: z.preprocess(emptyAsUnset, z.string().url().optional()),
  SUPABASE_SERVICE_ROLE_KEY: z.preprocess(emptyAsUnset, z.string().min(1).optional()),
  SUPABASE_STORAGE_BUCKET: z.preprocess(emptyAsUnset, z.string().min(1).default("files")),
```

และเปลี่ยนความเห็นของ `NEWS_UPLOAD_DIR` เป็น

```ts
  // Legacy: where news images lived before step 6. Read only by scripts/files-backfill.ts.
  NEWS_UPLOAD_DIR: z.string().default("var/news-uploads"),
```

ต่อจากบรรทัด `if (isProd && config.LINE_DRY_RUN) { ... }` เพิ่ม

```ts
if (config.FILE_STORAGE === "supabase" && !(config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY)) {
  throw new Error("FILE_STORAGE=supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
}
```

- [ ] **Step 3: test ใช้ local เสมอ และไฟล์ไม่ไปอยู่ในโฟลเดอร์ dev**

`vitest.config.ts` ใน `env` ต่อจาก `LINE_DRY_RUN: "false",`:

```ts
      // Tests never upload to a real bucket, even if .env selects supabase.
      FILE_STORAGE: "local",
      FILE_STORAGE_DIR: process.env.FILE_STORAGE_DIR ?? "var/test-files",
```

`scripts/test-fresh.ts` บรรทัด `const env = { ... }` เพิ่ม key `FILE_STORAGE_DIR: \`var/test-files/${name}\`` เพื่อให้แต่ละรอบใช้โฟลเดอร์ของตัวเอง (โฟลเดอร์ `var/` อยู่ใน `.gitignore` แล้ว) และใน `finally` หลังลบฐานข้อมูล เพิ่ม

```ts
  await rm(`var/test-files/${name}`, { recursive: true, force: true });
```

(import `rm` จาก `node:fs/promises`)

- [ ] **Step 4: `.gitignore` และ `.env.example`**

`prototype-1/backend/.gitignore` เพิ่มบรรทัด `storage/`

`.env.example` เพิ่ม

```
# File contents (shared plan 2.9): local = ./storage, supabase = a private Supabase Storage bucket.
# FILE_STORAGE=local
# FILE_STORAGE_DIR=storage
# SUPABASE_URL=https://<project-ref>.supabase.co
# SUPABASE_SERVICE_ROLE_KEY=        # server only, never in the frontend
# SUPABASE_STORAGE_BUCKET=files
```

- [ ] **Step 5: รันและ commit**

```bash
npm run test:fresh -- test/core/files-config.test.ts
npx tsc --noEmit
git add src/config.ts .gitignore .env.example vitest.config.ts scripts/test-fresh.ts test/core/files-config.test.ts
git commit -m "feat(core): file storage config (local and supabase)"
```

Expected: 3 test ผ่าน

---

### Task F3: `fileStore` และสอง driver

**Files:**
- Create: `prototype-1/backend/src/core/file-store.ts`
- Test: `prototype-1/backend/test/core/file-store.test.ts`

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

`test/core/file-store.test.ts`:

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLocalStore, createSupabaseStore, newStorageKey } from "../../src/core/file-store.js";

describe("newStorageKey", () => {
  it("is <year>/<month>/<uuid> with no user input", () => {
    expect(newStorageKey(new Date("2026-03-05T12:00:00Z"))).toMatch(/^2026\/03\/[0-9a-f-]{36}$/);
  });
});

describe("local store", () => {
  let root = "";
  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "files-"));
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("puts, gets, lists and removes", async () => {
    const store = createLocalStore(root);
    const key = newStorageKey(new Date("2026-11-25T00:00:00Z"));
    await store.put(key, Buffer.from("hello"), "text/plain");
    expect((await store.get(key)).toString()).toBe("hello");
    const listed = await store.list("2026/11/");
    expect(listed.map((o) => o.key)).toContain(key);
    expect(listed.find((o) => o.key === key)!.createdAt).toBeInstanceOf(Date);
    await store.remove(key);
    await expect(store.get(key)).rejects.toThrow();
    await store.remove(key); // removing twice is fine
  });

  it("refuses to overwrite an existing key", async () => {
    const store = createLocalStore(root);
    const key = newStorageKey();
    await store.put(key, Buffer.from("a"), "text/plain");
    await expect(store.put(key, Buffer.from("b"), "text/plain")).rejects.toThrow();
  });

  it("rejects keys that are not storage keys (no path traversal)", async () => {
    const store = createLocalStore(root);
    await expect(store.get("../../etc/passwd")).rejects.toThrow(/storage key/);
    await expect(store.put("a/b", Buffer.from("x"), "text/plain")).rejects.toThrow(/storage key/);
  });

  it("lists an empty month as empty", async () => {
    expect(await createLocalStore(root).list("1999/01/")).toEqual([]);
  });
});

describe("supabase store", () => {
  type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
  function fakeFetch(respond: (call: Call) => Response) {
    const calls: Call[] = [];
    const fn = async (input: string | URL, init?: RequestInit) => {
      const call = {
        url: String(input),
        method: init?.method ?? "GET",
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        body: init?.body,
      };
      calls.push(call);
      return respond(call);
    };
    return { fn: fn as typeof fetch, calls };
  }
  const opts = { url: "https://abc.supabase.co", serviceKey: "svc", bucket: "files" };
  const key = "2026/11/123e4567-e89b-12d3-a456-426614174000";

  it("uploads raw bytes with the service key and no upsert", async () => {
    const f = fakeFetch(() => new Response(JSON.stringify({ Key: `files/${key}` }), { status: 200 }));
    await createSupabaseStore({ ...opts, fetch: f.fn }).put(key, Buffer.from("pdf"), "application/pdf");
    expect(f.calls[0]).toMatchObject({
      url: `https://abc.supabase.co/storage/v1/object/files/${key}`,
      method: "POST",
    });
    expect(f.calls[0]!.headers).toMatchObject({
      authorization: "Bearer svc",
      apikey: "svc",
      "content-type": "application/pdf",
      "x-upsert": "false",
    });
  });

  it("downloads bytes and throws on a missing object", async () => {
    const ok = fakeFetch(() => new Response(Buffer.from("data"), { status: 200 }));
    expect((await createSupabaseStore({ ...opts, fetch: ok.fn }).get(key)).toString()).toBe("data");
    expect(ok.calls[0]).toMatchObject({ url: `https://abc.supabase.co/storage/v1/object/files/${key}`, method: "GET" });
    const missing = fakeFetch(() => new Response("{}", { status: 404 }));
    await expect(createSupabaseStore({ ...opts, fetch: missing.fn }).get(key)).rejects.toThrow(/404/);
  });

  it("removes with DELETE and a prefixes body", async () => {
    const f = fakeFetch(() => new Response("[]", { status: 200 }));
    await createSupabaseStore({ ...opts, fetch: f.fn }).remove(key);
    expect(f.calls[0]).toMatchObject({ url: "https://abc.supabase.co/storage/v1/object/files", method: "DELETE" });
    expect(JSON.parse(String(f.calls[0]!.body))).toEqual({ prefixes: [key] });
  });

  it("lists one month, paging until a short page", async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({ name: `a${i}`, created_at: "2026-11-01T00:00:00Z" }));
    const page2 = [{ name: "last", created_at: "2026-11-02T00:00:00Z" }];
    const f = fakeFetch((call) => {
      const { offset } = JSON.parse(String(call.body)) as { offset: number };
      return new Response(JSON.stringify(offset === 0 ? page1 : page2), { status: 200 });
    });
    const listed = await createSupabaseStore({ ...opts, fetch: f.fn }).list("2026/11/");
    expect(listed).toHaveLength(1001);
    expect(listed.at(-1)).toEqual({ key: "2026/11/last", createdAt: new Date("2026-11-02T00:00:00Z") });
    expect(f.calls[0]).toMatchObject({ url: "https://abc.supabase.co/storage/v1/object/list/files", method: "POST" });
    expect(JSON.parse(String(f.calls[0]!.body))).toMatchObject({ prefix: "2026/11/", limit: 1000, offset: 0 });
  });

  it("never puts the service key in an error message", async () => {
    const f = fakeFetch(() => new Response("denied", { status: 403 }));
    const error = await createSupabaseStore({ ...opts, fetch: f.fn })
      .put(key, Buffer.from("x"), "text/plain")
      .catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("403");
    expect((error as Error).message).not.toContain("svc");
  });
});
```

```bash
npm run test:fresh -- test/core/file-store.test.ts
```

Expected: FAIL (ไม่มี `file-store.js`)

- [ ] **Step 2: สร้าง `src/core/file-store.ts`**

```ts
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

/** Where file contents live. Keys come only from newStorageKey(); rows in `files` hold the metadata. */
export interface FileStore {
  /** Fails if the key already exists. */
  put(key: string, data: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  /** Removing a missing key is not an error. */
  remove(key: string): Promise<void>;
  /** Objects directly under a month prefix such as "2026/11/". */
  list(monthPrefix: string): Promise<{ key: string; createdAt: Date }[]>;
}

const KEY = /^\d{4}\/\d{2}\/[0-9a-f-]{36}$/;
const MONTH = /^\d{4}\/\d{2}\/$/;

function assertKey(key: string): void {
  if (!KEY.test(key)) throw new Error("not a storage key");
}
function assertMonth(prefix: string): void {
  if (!MONTH.test(prefix)) throw new Error("not a storage key month prefix");
}

/** "<year>/<month>/<uuid>" (UTC). Never contains a user-supplied file name. */
export function newStorageKey(now = new Date()): string {
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${now.getUTCFullYear()}/${month}/${randomUUID()}`;
}

export function createLocalStore(root: string): FileStore {
  const full = (key: string) => path.join(root, ...key.split("/"));
  return {
    async put(key, data) {
      assertKey(key);
      await mkdir(path.dirname(full(key)), { recursive: true });
      await writeFile(full(key), data, { flag: "wx" });
    },
    async get(key) {
      assertKey(key);
      return readFile(full(key));
    },
    async remove(key) {
      assertKey(key);
      await rm(full(key), { force: true });
    },
    async list(monthPrefix) {
      assertMonth(monthPrefix);
      const dir = path.join(root, ...monthPrefix.split("/").filter(Boolean));
      let names: string[];
      try {
        names = await readdir(dir);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw e;
      }
      return Promise.all(
        names.map(async (name) => ({ key: `${monthPrefix}${name}`, createdAt: (await stat(path.join(dir, name))).mtime })),
      );
    },
  };
}

export interface SupabaseStoreOptions {
  url: string;
  serviceKey: string;
  bucket: string;
  fetch?: typeof fetch;
}

/** Supabase Storage REST API, private bucket, service role key. Errors never include the key. */
export function createSupabaseStore(opts: SupabaseStoreOptions): FileStore {
  const doFetch = opts.fetch ?? fetch;
  const base = `${opts.url.replace(/\/+$/, "")}/storage/v1`;
  const auth = { authorization: `Bearer ${opts.serviceKey}`, apikey: opts.serviceKey };
  const fail = async (what: string, res: Response): Promise<never> => {
    throw new Error(`supabase storage ${what} failed: ${res.status}`);
  };
  return {
    async put(key, data, mime) {
      assertKey(key);
      const res = await doFetch(`${base}/object/${opts.bucket}/${key}`, {
        method: "POST",
        headers: { ...auth, "content-type": mime, "x-upsert": "false", "cache-control": "max-age=0" },
        body: new Uint8Array(data),
      });
      if (!res.ok) await fail("upload", res);
    },
    async get(key) {
      assertKey(key);
      const res = await doFetch(`${base}/object/${opts.bucket}/${key}`, { method: "GET", headers: auth });
      if (!res.ok) await fail("download", res);
      return Buffer.from(await res.arrayBuffer());
    },
    async remove(key) {
      assertKey(key);
      const res = await doFetch(`${base}/object/${opts.bucket}`, {
        method: "DELETE",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ prefixes: [key] }),
      });
      if (!res.ok && res.status !== 404) await fail("remove", res);
    },
    async list(monthPrefix) {
      assertMonth(monthPrefix);
      const out: { key: string; createdAt: Date }[] = [];
      const limit = 1000;
      for (let offset = 0; ; offset += limit) {
        const res = await doFetch(`${base}/object/list/${opts.bucket}`, {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify({ prefix: monthPrefix, limit, offset, sortBy: { column: "name", order: "asc" } }),
        });
        if (!res.ok) await fail("list", res);
        const page = (await res.json()) as { name: string; created_at: string | null }[];
        for (const o of page) if (o.created_at) out.push({ key: `${monthPrefix}${o.name}`, createdAt: new Date(o.created_at) });
        if (page.length < limit) return out;
      }
    },
  };
}

/** The store chosen by FILE_STORAGE. */
export const fileStore: FileStore =
  config.FILE_STORAGE === "supabase"
    ? createSupabaseStore({
        url: config.SUPABASE_URL!,
        serviceKey: config.SUPABASE_SERVICE_ROLE_KEY!,
        bucket: config.SUPABASE_STORAGE_BUCKET,
      })
    : createLocalStore(path.resolve(config.FILE_STORAGE_DIR));
```

หมายเหตุ: แถวใน list ของ Supabase ที่ไม่มี `created_at` (ถ้ามี sub-folder) ถูกข้าม เพราะ key ของเราไม่มีโฟลเดอร์ใต้เดือน

- [ ] **Step 3: รันและ commit**

```bash
npm run test:fresh -- test/core/file-store.test.ts
npx tsc --noEmit
git add src/core/file-store.ts test/core/file-store.test.ts
git commit -m "feat(core): fileStore with local and Supabase Storage drivers"
```

Expected: test ใน `file-store.test.ts` ผ่านทั้งหมด

---

### Task F4: ตาราง `files` และ `file_id` (migration ขั้นแรก)

**Files:**
- Modify: `prototype-1/backend/prisma/schema/core.prisma`, `course-change.prisma`, `news.prisma`
- Create: `prototype-1/backend/prisma/schema/migrations/20261125140000_files/migration.sql`

- [ ] **Step 1: แก้ schema**

`core.prisma` เพิ่มท้ายไฟล์ (ตามแผนของกลางหัวข้อ 3.7):

```prisma
/// File metadata (shared plan 3.7). Contents live in fileStore, never in the database.
/// Write only through src/core/files.ts. Module tables point here with file_id.
model File {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  /// "<year>/<month>/<uuid>" in the local folder or the bucket.
  storageKey   String   @unique @map("storage_key")
  originalName String   @map("original_name")
  mime         String
  /// Bytes.
  size         Int
  sha256       String   @db.Char(64)
  module       String
  uploadedById String?  @map("uploaded_by") @db.Uuid
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  uploadedBy       User?             @relation("filesUploaded", fields: [uploadedById], references: [id], onDelete: Restrict)
  courseChangeFile CourseChangeFile?
  newsImage        NewsImage?

  @@index([module, createdAt])
  @@map("files")
}
```

ใน `model User` เพิ่ม relation ต่อจาก `auditLogs`:

```prisma
  filesUploaded       File[]               @relation("filesUploaded")
```

`course-change.prisma` ใน `model CourseChangeFile`:

```prisma
  /// Legacy bytea, dropped in 20261125140100_files_drop_legacy after files:backfill.
  data       Bytes?
  fileId     String?             @unique @map("file_id") @db.Uuid
  ...
  file       File?               @relation(fields: [fileId], references: [id], onDelete: Restrict)
```

`news.prisma` ใน `model NewsImage`:

```prisma
  /// Legacy file name in NEWS_UPLOAD_DIR, dropped in 20261125140100_files_drop_legacy after files:backfill.
  storageKey   String?  @unique @map("storage_key") @db.VarChar(80)
  fileId       String?  @unique @map("file_id") @db.Uuid
  ...
  file File? @relation(fields: [fileId], references: [id], onDelete: Restrict)
```

- [ ] **Step 2: สร้าง migration**

```bash
npx prisma format && npx prisma validate
npx prisma migrate diff --from-migrations prisma/schema/migrations --to-schema-datamodel prisma/schema \
  --shadow-database-url "<disposable DB URL>" --script > ../../migration.tmp.sql
```

(สร้างฐานข้อมูลชั่วคราวสำหรับ shadow แบบเดียวกับ `scripts/test-fresh.ts` แล้วลบทิ้ง ห้ามใช้ฐานข้อมูล dev) ลบบรรทัด `timeslot` แล้วสร้าง `prisma/schema/migrations/20261125140000_files/migration.sql` ที่ต้องมีอย่างน้อย

```sql
-- Step 6 (shared plan 3.7): file metadata table; contents live in fileStore.
-- course_change_files.data and news_images.storage_key stay until files:backfill moves them
-- (dropped in 20261125140100_files_drop_legacy).
CREATE TABLE "files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "module" TEXT NOT NULL,
    "uploaded_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "files_storage_key_key" ON "files"("storage_key");
CREATE INDEX "files_module_created_at_idx" ON "files"("module", "created_at");
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "course_change_files" ADD COLUMN "file_id" UUID, ALTER COLUMN "data" DROP NOT NULL;
CREATE UNIQUE INDEX "course_change_files_file_id_key" ON "course_change_files"("file_id");
ALTER TABLE "course_change_files" ADD CONSTRAINT "course_change_files_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "news_images" ADD COLUMN "file_id" UUID, ALTER COLUMN "storage_key" DROP NOT NULL;
CREATE UNIQUE INDEX "news_images_file_id_key" ON "news_images"("file_id");
ALTER TABLE "news_images" ADD CONSTRAINT "news_images_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

เทียบกับ diff ที่ได้ ถ้าชื่อ constraint หรือ index ต่างจากนี้ ให้ใช้ของ diff

- [ ] **Step 3: ตรวจและ commit**

```bash
npx prisma generate && npx tsc --noEmit
npm run test:fresh
```

Expected: tsc ผ่าน (โค้ดเดิมยังใช้ `data` และ `storageKey` ได้ เพราะคอลัมน์ยังอยู่) test ผ่านทั้งหมดยกเว้น BR-14

```bash
git add prisma/schema
git commit -m "feat(core): files table and file_id columns (legacy columns kept until backfill)"
```

---

### Task F5: บริการ `src/core/files.ts`

**Files:**
- Create: `prototype-1/backend/src/core/files.ts`
- Test: `prototype-1/backend/test/core/files.test.ts`

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

`test/core/files.test.ts`:

```ts
import { createHash } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { fileStore } from "../../src/core/file-store.js";
import { deleteFileRecord, readFile, removeStoredFile, saveFile, withFileTransaction } from "../../src/core/files.js";
import { prisma } from "../../src/db.js";
import { idOf } from "../helpers/session.js";

afterAll(async () => {
  await prisma.$disconnect();
});

const input = (text: string, uploadedBy: string | null = null) => ({
  buffer: Buffer.from(text),
  mime: "text/plain",
  originalName: "note.txt",
  module: "course_change",
  uploadedBy,
});

describe("saveFile and readFile", () => {
  it("stores the contents in fileStore and the metadata in files", async () => {
    const staff = await idOf(prisma, "staff@test.local");
    const saved = await prisma.$transaction((tx) => saveFile(tx, input("hello", staff)));
    const row = await prisma.file.findUniqueOrThrow({ where: { id: saved.id } });
    expect(row).toMatchObject({
      originalName: "note.txt",
      mime: "text/plain",
      size: 5,
      module: "course_change",
      uploadedById: staff,
      sha256: createHash("sha256").update("hello").digest("hex"),
    });
    expect(row.storageKey).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}$/);
    const read = await readFile(saved.id);
    expect(read.buffer.toString()).toBe("hello");
    expect(read).toMatchObject({ mime: "text/plain", originalName: "note.txt", size: 5 });
  });

  it("rejects an empty file and a bad module name", async () => {
    await expect(prisma.$transaction((tx) => saveFile(tx, input("")))).rejects.toThrow(/empty/);
    await expect(prisma.$transaction((tx) => saveFile(tx, { ...input("x"), module: "Bad Module" }))).rejects.toThrow(
      /module/,
    );
  });

  it("readFile of an unknown id is NOT_FOUND", async () => {
    await expect(readFile("00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("withFileTransaction", () => {
  it("removes uploaded contents when the transaction rolls back", async () => {
    let key = "";
    await expect(
      withFileTransaction(async (_tx, files) => {
        key = (await files.save(input("rollback me"))).storageKey;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(key).not.toBe("");
    expect(await prisma.file.count({ where: { storageKey: key } })).toBe(0);
    await expect(fileStore.get(key)).rejects.toThrow();
  });

  it("keeps contents and rows when it commits", async () => {
    const saved = await withFileTransaction((_tx, files) => files.save(input("keep me")));
    expect((await fileStore.get(saved.storageKey)).toString()).toBe("keep me");
  });
});

describe("deleteFileRecord and removeStoredFile", () => {
  it("deletes the row in the transaction, then the contents after commit", async () => {
    const saved = await withFileTransaction((_tx, files) => files.save(input("bye")));
    const key = await prisma.$transaction((tx) => deleteFileRecord(tx, saved.id));
    expect(key).toBe(saved.storageKey);
    expect(await prisma.file.count({ where: { id: saved.id } })).toBe(0);
    await removeStoredFile(key);
    await expect(fileStore.get(key)).rejects.toThrow();
  });
});
```

```bash
npm run test:fresh -- test/core/files.test.ts
```

Expected: FAIL (ไม่มี `files.js`)

- [ ] **Step 2: สร้าง `src/core/files.ts`**

```ts
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma, type Tx } from "../db.js";
import { notFound } from "../lib/errors.js";
import { fileStore, newStorageKey } from "./file-store.js";

const MODULE = /^[a-z][a-z0-9_]*$/;
/** Uploading to Supabase happens inside the transaction; Prisma's default 5 s is too short for 10 MB. */
const FILE_TX_TIMEOUT_MS = 30_000;

export interface SaveFileInput {
  buffer: Buffer;
  mime: string;
  /** Shown to users and used as the download name. Never part of the storage key. */
  originalName: string;
  /** The owning module, e.g. "course_change", "news". */
  module: string;
  uploadedBy: string | null;
}

export interface SavedFile {
  id: string;
  storageKey: string;
  size: number;
  sha256: string;
}

/**
 * Uploads the contents, then writes the `files` row with tx. If the row fails, the contents are removed.
 * If the caller's transaction rolls back later, the contents stay until scripts/files-sweep.ts removes
 * them; use withFileTransaction() to remove them at once instead.
 */
export async function saveFile(tx: Tx, input: SaveFileInput): Promise<SavedFile> {
  if (input.buffer.length === 0) throw new Error("saveFile: file is empty");
  if (!MODULE.test(input.module)) throw new Error(`saveFile: module "${input.module}" must be snake_case`);
  const storageKey = newStorageKey();
  const sha256 = createHash("sha256").update(input.buffer).digest("hex");
  await fileStore.put(storageKey, input.buffer, input.mime);
  try {
    const row = await tx.file.create({
      data: {
        storageKey,
        originalName: input.originalName,
        mime: input.mime,
        size: input.buffer.length,
        sha256,
        module: input.module,
        uploadedById: input.uploadedBy,
      },
      select: { id: true },
    });
    return { id: row.id, storageKey, size: input.buffer.length, sha256 };
  } catch (e) {
    await fileStore.remove(storageKey).catch(() => undefined);
    throw e;
  }
}

export interface FileWriter {
  save(input: SaveFileInput): Promise<SavedFile>;
}

/**
 * Runs fn in one transaction. Files saved through `files.save` are removed from fileStore if the
 * transaction rolls back (shared plan 2.9: upload first, write the row, delete the file on failure).
 */
export async function withFileTransaction<T>(
  fn: (tx: Tx, files: FileWriter) => Promise<T>,
  options: { timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel } = {},
): Promise<T> {
  const written: string[] = [];
  try {
    return await prisma.$transaction(
      (tx) =>
        fn(tx, {
          save: async (input) => {
            const saved = await saveFile(tx, input);
            written.push(saved.storageKey);
            return saved;
          },
        }),
      { timeout: options.timeout ?? FILE_TX_TIMEOUT_MS, isolationLevel: options.isolationLevel },
    );
  } catch (e) {
    await Promise.allSettled(written.map((key) => fileStore.remove(key)));
    throw e;
  }
}

export interface StoredFile {
  buffer: Buffer;
  mime: string;
  originalName: string;
  size: number;
  sha256: string;
}

/** The contents and metadata of a file. Callers check permissions first (downloads go through modules). */
export async function readFile(fileId: string, db: Tx = prisma): Promise<StoredFile> {
  const row = await db.file.findUnique({ where: { id: fileId } });
  if (!row) throw notFound("ไม่พบไฟล์");
  const buffer = await fileStore.get(row.storageKey);
  return { buffer, mime: row.mime, originalName: row.originalName, size: row.size, sha256: row.sha256 };
}

/**
 * Deletes the `files` row inside tx and returns its storage key. Remove the contents with
 * removeStoredFile() AFTER the transaction commits, so a rollback never loses contents.
 */
export async function deleteFileRecord(tx: Tx, fileId: string): Promise<string> {
  const row = await tx.file.delete({ where: { id: fileId }, select: { storageKey: true } });
  return row.storageKey;
}

/** Best effort: a failure leaves an orphan that scripts/files-sweep.ts removes later. */
export async function removeStoredFile(storageKey: string): Promise<void> {
  await fileStore.remove(storageKey);
}
```

- [ ] **Step 3: รันและ commit**

```bash
npm run test:fresh -- test/core/files.test.ts
npx tsc --noEmit
git add src/core/files.ts test/core/files.test.ts
git commit -m "feat(core): saveFile, withFileTransaction, readFile and deleteFileRecord"
```

Expected: test ใน `files.test.ts` ผ่านทั้งหมด

---

### Task F6: ลด-ถอนรายวิชาใช้ `files`

**Files:**
- Modify: `prototype-1/backend/src/modules/course-change/workflow.ts` (`uploadFile`, `mergeFiles`, `downloadFile`)
- Modify: `prototype-1/backend/src/modules/course-change/routes.ts` (route ดาวน์โหลด)
- Modify: `prototype-1/backend/scripts/demo-reset.ts`
- Test: `prototype-1/backend/test/course-change-workflow.test.ts`

- [ ] **Step 1: เพิ่ม test ที่ยังไม่ผ่าน**

ใน `test/course-change-workflow.test.ts` หา test ที่อัปโหลด `signed_petition` แล้วดาวน์โหลด (`grep -n "signedId" test/course-change-workflow.test.ts`) ต่อท้าย test นั้นเพิ่ม

```ts
    // Step 6: the PDF lives in fileStore; the row only points at files.
    const stored = await prisma.courseChangeFile.findUniqueOrThrow({
      where: { id: signedId },
      select: { fileId: true, file: { select: { module: true, mime: true } } },
    });
    expect(stored.fileId).not.toBeNull();
    expect(stored.file).toMatchObject({ module: "course_change", mime: "application/pdf" });
    expect(downloaded.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
```

```bash
npm run test:fresh -- test/course-change-workflow.test.ts
```

Expected: FAIL (`fileId` เป็น null)

- [ ] **Step 2: `uploadFile` ใน `workflow.ts`**

import ด้านบน:

```ts
import { readFile, withFileTransaction } from "../../core/files.js";
```

เปลี่ยน `await prisma.$transaction(async (tx) => {` ของ `uploadFile` เป็น `await withFileTransaction(async (tx, files) => {` และแทนการสร้างแถว:

```ts
    const stored = await files.save({
      buffer: data,
      mime: "application/pdf",
      originalName: safe,
      module: "course_change",
      uploadedBy: me.id,
    });
    const file = await tx.courseChangeFile.create({
      data: {
        requestId: id,
        kind,
        filename: safe,
        fileId: stored.id,
        sha256: stored.sha256,
        uploaderId: me.id,
      },
    });
```

(ลบ `data: new Uint8Array(data)` และ `sha256: digest(data)` ออก)

- [ ] **Step 3: `mergeFiles` ใน `workflow.ts`**

เปลี่ยน `await prisma.$transaction(async (tx) => {` ของ `mergeFiles` เป็น `await withFileTransaction(async (tx, files) => {`

แทน `const source = await PDFDocument.load(file.data);` ด้วย

```ts
      if (!file.fileId) throw conflict("เอกสารยังไม่ได้ย้ายไปที่เก็บไฟล์ใหม่ กรุณาแจ้งผู้ดูแลระบบ");
      const source = await PDFDocument.load((await readFile(file.fileId, tx)).buffer);
```

และแทนการสร้างแถว merged:

```ts
    const stored = await files.save({
      buffer: data,
      mime: "application/pdf",
      originalName: `${r.requestNo}_merged.pdf`,
      module: "course_change",
      uploadedBy: me.id,
    });
    const merged = await tx.courseChangeFile.create({
      data: {
        requestId: id,
        kind: "merged",
        filename: `${r.requestNo}_merged.pdf`,
        fileId: stored.id,
        sha256: stored.sha256,
        uploaderId: me.id,
      },
    });
```

ถ้า `digest` ไม่ถูกใช้ที่อื่นแล้ว (`grep -n "digest(" src/modules/course-change/workflow.ts`) ให้ลบ import หรือฟังก์ชันนั้น

- [ ] **Step 4: `downloadFile` และ route**

`downloadFile` เปลี่ยน `findFirst` ให้เลือกเฉพาะที่ใช้:

```ts
  const file = await prisma.courseChangeFile.findFirst({
    where: { id: fileId, requestId: id },
    select: { id: true, kind: true, filename: true, fileId: true },
  });
```

และก่อน `return file;` เพิ่ม

```ts
  if (!file.fileId) throw notFound("ไม่พบเอกสาร");
  return { filename: file.filename, buffer: (await readFile(file.fileId)).buffer };
```

(ลบ `return file;` เดิม) การตรวจสิทธิ์ (`loadVisible`, เอกสารลงนามที่ยังไม่ส่งคืน) อยู่ก่อนบรรทัดนี้เหมือนเดิม

`routes.ts` route `GET /course-change/requests/:id/files/:fileId` เปลี่ยน `.send(Buffer.from(file.data))` เป็น `.send(file.buffer)`

- [ ] **Step 5: `scripts/demo-reset.ts` ลบไฟล์ของคำร้องที่ลบด้วย**

ใน transaction ก่อน `const requests = await tx.courseChangeRequest.deleteMany(...)` เพิ่ม

```ts
    const fileIds = (
      await tx.courseChangeFile.findMany({ where: { requestId: { in: ids }, fileId: { not: null } }, select: { fileId: true } })
    ).map((f) => f.fileId!);
    await tx.courseChangeFile.deleteMany({ where: { requestId: { in: ids } } });
    const storageKeys: string[] = [];
    for (const fileId of fileIds) storageKeys.push(await deleteFileRecord(tx, fileId));
```

ให้ callback ของ transaction คืน `storageKeys` ด้วย แล้วหลัง transaction:

```ts
  for (const key of result.storageKeys) await removeStoredFile(key);
```

(import `deleteFileRecord`, `removeStoredFile` จาก `../src/core/files.js` และพิมพ์จำนวนไฟล์ที่ลบใน log สรุปเดิม)

- [ ] **Step 6: รันและ commit**

```bash
npx tsc --noEmit
npm run test:fresh -- test/course-change-workflow.test.ts
npm run test:fresh
git add src/modules/course-change scripts/demo-reset.ts test/course-change-workflow.test.ts
git commit -m "feat(course-change): store PDFs in fileStore instead of bytea"
```

Expected: test ของลด-ถอนรายวิชาผ่านทั้งหมด รวมถึง test เดิมที่นิสิตอีกคนดาวน์โหลดไม่ได้และเอกสารลงนามที่ยังไม่ส่งคืน test ทั้งหมดผ่านยกเว้น BR-14

---

### Task F7: ข่าวใช้ `files`

**Files:**
- Modify: `prototype-1/backend/src/modules/news/service.ts`, `prototype-1/backend/src/modules/news/routes.ts`
- Delete: `prototype-1/backend/src/modules/news/storage.ts`
- Test: `prototype-1/backend/test/news-images.test.ts`

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

`test/news-images.test.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { fileStore } from "../src/core/file-store.js";
import { prisma } from "../src/db.js";
import { addNewsImages, createNews } from "../src/modules/news/service.js";
import { idOf, loginAs } from "./helpers/session.js";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("png-body")]);
let app: FastifyInstance;
let staffCookie = "";
let newsId = "";

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  staffCookie = await loginAs(app, "staff@test.local");
  const author = await idOf(prisma, "staff@test.local");
  const { news } = await createNews(author, { title: "Step 6 test news", content: "<p>x</p>", tags: [] }, [
    { filename: "poster.png", mimeType: "image/png", buffer: PNG },
  ]);
  newsId = news.id;
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

const imageUrl = (imageId: string) => `/api/v1/news/${newsId}/images/${imageId}`;

describe("news images in fileStore", () => {
  it("saves the image as a files row and serves it to staff", async () => {
    const image = await prisma.newsImage.findFirstOrThrow({ where: { newsId }, include: { file: true } });
    expect(image.file).toMatchObject({ module: "news", mime: "image/png", originalName: "poster.png" });
    const res = await app.inject({ method: "GET", url: imageUrl(image.id), headers: { cookie: staffCookie } });
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.equals(PNG)).toBe(true);
  });

  it("hides images of a draft from the public", async () => {
    const image = await prisma.newsImage.findFirstOrThrow({ where: { newsId } });
    expect((await app.inject({ method: "GET", url: imageUrl(image.id) })).statusCode).toBe(404);
  });

  it("removes the files row and the contents when an image is deleted", async () => {
    const { news } = await addNewsImages(newsId, [{ filename: "second.png", mimeType: "image/png", buffer: PNG }]);
    const added = news.images.find((i) => i.originalName === "second.png")!;
    const row = await prisma.newsImage.findUniqueOrThrow({ where: { id: added.id }, include: { file: true } });
    const res = await app.inject({
      method: "DELETE",
      url: imageUrl(added.id),
      headers: { cookie: staffCookie, "x-requested-with": "XMLHttpRequest" },
    });
    expect(res.statusCode).toBe(200);
    expect(await prisma.file.count({ where: { id: row.file!.id } })).toBe(0);
    await expect(fileStore.get(row.file!.storageKey)).rejects.toThrow();
  });
});
```

```bash
npm run test:fresh -- test/news-images.test.ts
```

Expected: FAIL (`image.file` เป็น null)

- [ ] **Step 2: `news/service.ts`**

ลบ `import { removeNewsImage, saveNewsImage } from "./storage.js";` แล้ว import

```ts
import { deleteFileRecord, readFile, withFileTransaction, type FileWriter } from "../../core/files.js";
```

เพิ่ม helper:

```ts
async function storeImages(files: FileWriter, images: readonly IncomingNewsImage[], firstPosition: number, authorId: string | null) {
  const stored = [];
  for (const [index, image] of images.entries()) {
    const file = await files.save({
      buffer: image.buffer,
      mime: image.mimeType,
      originalName: image.filename,
      module: "news",
      uploadedBy: authorId,
    });
    stored.push({
      fileId: file.id,
      originalName: image.filename,
      mimeType: image.mimeType,
      sizeBytes: image.buffer.length,
      position: firstPosition + index,
    });
  }
  return stored;
}
```

`createNews`: แทนทั้งตัวฟังก์ชันหลัง `const images = validateNewsImages(incomingImages);` ด้วย

```ts
  const news = await withFileTransaction(async (tx, files) => {
    const storedImages = await storeImages(files, images, 0, authorId);
    return tx.newsArticle.create({
      data: { ...sanitizedFields(fields), authorId, images: { create: storedImages } },
      select: newsSelection,
    });
  });
  return { news };
```

`addNewsImages`: เปลี่ยน `prisma.$transaction(async (tx) => {` เป็น `withFileTransaction(async (tx, files) => {` ลบตัวแปร `savedKeys` และ `try/catch` ที่ลบไฟล์ แทน loop สร้าง `storedImages` ด้วย

```ts
      const storedImages = (await storeImages(files, images, existing._count.images, null)).map((img) => ({
        ...img,
        newsId: id,
      }));
```

`removeNewsImageRecord`: เลือก `fileId` แทน `storageKey` และหลัง `await tx.newsImage.delete(...)` ลบแถวไฟล์ใน transaction เดียวกัน:

```ts
    const image = await tx.newsImage.findFirst({
      where: { id: imageId, newsId: id },
      select: { id: true, fileId: true },
    });
    if (!image) throw notFound("News image not found");

    await tx.newsImage.delete({ where: { id: imageId } });
    const storageKey = image.fileId ? await deleteFileRecord(tx, image.fileId) : null;
    ...
    return { storageKey };
```

`getNewsImageRecord`: เลือก `fileId` แทน `storageKey` (`select: { fileId: true, mimeType: true, originalName: true }`) และเพิ่มฟังก์ชัน

```ts
export async function readNewsImageBytes(fileId: string | null): Promise<Buffer> {
  if (!fileId) throw notFound("News image not found");
  return (await readFile(fileId)).buffer;
}
```

- [ ] **Step 3: `news/routes.ts` และลบ `storage.ts`**

ลบ `import { readNewsImage, removeNewsImage } from "./storage.js";` แล้ว import `removeStoredFile` จาก `../../core/files.js` และ `readNewsImageBytes` จาก `./service.js`

route ลบรูป:

```ts
    const { storageKey } = await removeNewsImageRecord(id, imageId);
    if (storageKey) {
      try {
        await removeStoredFile(storageKey);
      } catch (error) {
        // The row is gone; scripts/files-sweep.ts removes the orphaned contents later.
        req.log.error({ err: error, storageKey }, "Failed to remove news image contents");
      }
    }
    return { ok: true };
```

route อ่านรูป: `const bytes = await readNewsImageBytes(image.fileId);`

```bash
git rm src/modules/news/storage.ts
grep -rn "news/storage\|saveNewsImage\|readNewsImage\b\|removeNewsImage\b" src prisma scripts test
```

Expected: grep ไม่เจออะไร

- [ ] **Step 4: รันและ commit**

```bash
npx tsc --noEmit
npm run test:fresh -- test/news-images.test.ts
npm run test:fresh
git add src/modules/news test/news-images.test.ts
git commit -m "feat(news): store images in fileStore instead of the news upload folder"
```

Expected: 3 test ใหม่ผ่าน, test ทั้งหมดผ่านยกเว้น BR-14 (seed ยังสร้างรูปโปสเตอร์ผ่าน `addNewsImages` จึงไปอยู่ใน fileStore)

---

### Task F8: ย้ายข้อมูลเดิม (backfill) และลบคอลัมน์เดิม (migration ขั้นที่สอง)

**Files:**
- Create: `prototype-1/backend/scripts/files-backfill.ts`
- Modify: `prototype-1/backend/package.json` (script `files:backfill`)
- Modify: `prototype-1/backend/prisma/schema/course-change.prisma`, `news.prisma`
- Create: `prototype-1/backend/prisma/schema/migrations/20261125140100_files_drop_legacy/migration.sql`

- [ ] **Step 1: สคริปต์ backfill**

สคริปต์อ่านคอลัมน์เดิมด้วย SQL ตรง เพราะหลัง migration ขั้นที่สอง Prisma client ไม่มีคอลัมน์เหล่านั้นแล้ว และทำซ้ำได้ (ข้ามแถวที่มี `file_id` แล้ว)

`scripts/files-backfill.ts`:

```ts
import { readFile as readDisk } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { config } from "../src/config.js";
import { withFileTransaction } from "../src/core/files.js";
import { prisma } from "../src/db.js";

/**
 * Moves file contents saved before step 6 into fileStore:
 * - course_change_files.data (bytea)
 * - news_images.storage_key (a file in NEWS_UPLOAD_DIR)
 * Run it after migration 20261125140000_files and before 20261125140100_files_drop_legacy.
 * dropMissing: delete news_images rows whose file is no longer on disk (otherwise they block the migration).
 */
export async function backfillFiles(opts: { dropMissing?: boolean } = {}) {
  const result = { courseChange: 0, news: 0, missingNews: 0, droppedNews: 0 };

  const ccRows = await prisma.$queryRaw<{ id: string; filename: string; data: Buffer | null; uploader_id: string }[]>`
    SELECT "id", "filename", "data", "uploader_id" FROM "course_change_files" WHERE "file_id" IS NULL`;
  for (const row of ccRows) {
    if (!row.data || row.data.length === 0) continue;
    await withFileTransaction(async (tx, files) => {
      const saved = await files.save({
        buffer: Buffer.from(row.data!),
        mime: "application/pdf",
        originalName: row.filename,
        module: "course_change",
        uploadedBy: row.uploader_id,
      });
      await tx.$executeRaw`UPDATE "course_change_files" SET "file_id" = ${saved.id}::uuid WHERE "id" = ${row.id}::uuid AND "file_id" IS NULL`;
    });
    result.courseChange++;
  }

  const newsRows = await prisma.$queryRaw<{ id: string; storage_key: string | null; original_name: string; mime_type: string }[]>`
    SELECT "id", "storage_key", "original_name", "mime_type" FROM "news_images" WHERE "file_id" IS NULL`;
  for (const row of newsRows) {
    let buffer: Buffer | null = null;
    if (row.storage_key) {
      try {
        buffer = await readDisk(path.join(path.resolve(config.NEWS_UPLOAD_DIR), path.basename(row.storage_key)));
      } catch {
        buffer = null;
      }
    }
    if (!buffer) {
      result.missingNews++;
      if (opts.dropMissing) {
        await prisma.$executeRaw`DELETE FROM "news_images" WHERE "id" = ${row.id}::uuid AND "file_id" IS NULL`;
        result.droppedNews++;
      }
      continue;
    }
    await withFileTransaction(async (tx, files) => {
      const saved = await files.save({
        buffer: buffer!,
        mime: row.mime_type,
        originalName: row.original_name,
        module: "news",
        uploadedBy: null,
      });
      await tx.$executeRaw`UPDATE "news_images" SET "file_id" = ${saved.id}::uuid WHERE "id" = ${row.id}::uuid AND "file_id" IS NULL`;
    });
    result.news++;
  }
  return result;
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const r = await backfillFiles({ dropMissing: process.argv.includes("--drop-missing") });
    console.log(
      `files backfill: course change PDFs ${r.courseChange}, news images ${r.news}, ` +
        `news images missing on disk ${r.missingNews}${r.droppedNews ? ` (rows dropped ${r.droppedNews})` : ""}`,
    );
    if (r.missingNews > r.droppedNews) {
      console.log("Some news images are missing on disk. Re-run with --drop-missing to delete those rows.");
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}
```

`package.json` เพิ่ม script `"files:backfill": "tsx --env-file=.env scripts/files-backfill.ts"`

- [ ] **Step 2: ลบคอลัมน์เดิมใน schema**

`course-change.prisma` ใน `CourseChangeFile`: ลบบรรทัด `data Bytes?` และเปลี่ยนเป็น

```prisma
  fileId     String              @unique @map("file_id") @db.Uuid
  ...
  file       File                @relation(fields: [fileId], references: [id], onDelete: Restrict)
```

`news.prisma` ใน `NewsImage`: ลบ `storageKey` และเปลี่ยนเป็น

```prisma
  fileId       String   @unique @map("file_id") @db.Uuid
  ...
  file File @relation(fields: [fileId], references: [id], onDelete: Restrict)
```

`core.prisma` ใน `File` ไม่ต้องแก้ (back-relation ยังเป็น `?`)

แก้โค้ดที่เคยรองรับ `fileId` ว่าง (ตอนนี้ไม่มีทางว่างแล้ว):
- `workflow.ts` ลบบรรทัด `if (!file.fileId) throw ...` ใน `mergeFiles` และ `downloadFile`
- `demo-reset.ts` ลบ `fileId: { not: null }` และ `!`
- `news/service.ts` `removeNewsImageRecord` ใช้ `await deleteFileRecord(tx, image.fileId)` ตรงๆ และ `readNewsImageBytes(fileId: string)`; `news/routes.ts` ลบ `if (storageKey)`

- [ ] **Step 3: migration ขั้นที่สองพร้อม guard**

สร้าง `prisma/schema/migrations/20261125140100_files_drop_legacy/migration.sql` (เทียบกับ `prisma migrate diff` แบบ Task F4 Step 2 ชื่อ index ของ storage key ดูได้จาก `grep -n storage_key prisma/schema/migrations/20261113160000_news_management/migration.sql`):

```sql
-- Step 6, part 2: drop the legacy file columns. Fresh databases pass straight through.
-- A database with rows saved before step 6 must run files:backfill first.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "course_change_files" WHERE "file_id" IS NULL)
     OR EXISTS (SELECT 1 FROM "news_images" WHERE "file_id" IS NULL) THEN
    RAISE EXCEPTION 'Files not moved yet. Run "npm run files:backfill", then "npx prisma migrate resolve --rolled-back 20261125140100_files_drop_legacy", then deploy again.';
  END IF;
END $$;

ALTER TABLE "course_change_files" DROP COLUMN "data", ALTER COLUMN "file_id" SET NOT NULL;

DROP INDEX "news_images_storage_key_key";
ALTER TABLE "news_images" DROP COLUMN "storage_key", ALTER COLUMN "file_id" SET NOT NULL;
```

- [ ] **Step 4: ตรวจบนฐานข้อมูลใหม่**

```bash
npx prisma generate && npx tsc --noEmit
npm run test:fresh
```

Expected: tsc ผ่าน, test ผ่านทั้งหมดยกเว้น BR-14, migration ทั้งสองขั้นผ่านบนฐานข้อมูลใหม่

```bash
grep -rn "Bytes" prisma/schema/*.prisma
```

Expected: ไม่เจอ (ไม่มีคอลัมน์ bytea เหลือ ตามเกณฑ์ "เสร็จเมื่อ" ของแผนของกลาง)

- [ ] **Step 5: ตรวจการย้ายข้อมูลเดิมด้วยมือ (ฐานข้อมูลชั่วคราว)**

ทำบนฐานข้อมูลชั่วคราวเท่านั้น ห้ามทำบนฐานข้อมูล dev ของทีม

1. สร้างฐานข้อมูลชั่วคราว (เช่น `labsync_files_verify`) และไฟล์ env ชั่วคราวนอก repo ที่ `DATABASE_URL` ชี้ไปที่ฐานข้อมูลนั้น และ `NEWS_UPLOAD_DIR` ชี้ไปที่โฟลเดอร์ชั่วคราว
2. สร้างข้อมูลแบบก่อนขั้นที่ 6 จากโค้ด `main`: `git worktree add <โฟลเดอร์ชั่วคราว> main` (ใช้ worktree เฉพาะขั้นนี้ เพื่อไม่ต้องสลับ branch ใน checkout หลัก) แล้วในโฟลเดอร์นั้น `npm ci`, `npx prisma migrate deploy`, `npx tsx prisma/seed.ts` (ได้รูปข่าวบนดิสก์) และ `npx tsx scripts/demo-course-change-scenarios.ts` (ได้ PDF ใน bytea) ด้วย env ชั่วคราว จากนั้นลบ worktree นั้น
3. กลับมาที่ `core/files`: `npx prisma migrate deploy` → ต้องหยุดที่ `20261125140100_files_drop_legacy` พร้อมข้อความ "Files not moved yet"
4. `npx tsx --env-file=<env ชั่วคราว> scripts/files-backfill.ts` → เห็นจำนวน PDF และรูปที่ย้าย
5. `npx prisma migrate resolve --rolled-back 20261125140100_files_drop_legacy` แล้ว `npx prisma migrate deploy` → ผ่าน
6. เปิด backend ด้วย env ชั่วคราว แล้วดาวน์โหลด PDF หนึ่งไฟล์และเปิดรูปข่าวหนึ่งรูปได้
7. ลบฐานข้อมูลชั่วคราว, env ชั่วคราว และโฟลเดอร์ไฟล์ชั่วคราว

ถ้าขั้นใดไม่ผ่าน ให้แก้สคริปต์หรือ migration แล้วทำใหม่ตั้งแต่ข้อ 1

- [ ] **Step 6: commit**

```bash
git add scripts/files-backfill.ts package.json prisma/schema src/modules scripts/demo-reset.ts
git commit -m "feat(core): backfill legacy files into fileStore and drop the bytea and disk columns"
```

---

### Task F9: sweep ไฟล์ค้าง

**Files:**
- Create: `prototype-1/backend/scripts/files-sweep.ts`
- Modify: `prototype-1/backend/package.json` (script `files:sweep`)
- Test: `prototype-1/backend/test/core/files.test.ts`

- [ ] **Step 1: เพิ่ม test ที่ยังไม่ผ่าน**

ต่อท้าย `test/core/files.test.ts` (รวม import ไว้ด้านบนของไฟล์):

```ts
import { utimes } from "node:fs/promises";
import path from "node:path";
import { config } from "../../src/config.js";
import { newStorageKey } from "../../src/core/file-store.js";
import { sweepOrphanFiles } from "../../scripts/files-sweep.js";

describe("sweepOrphanFiles", () => {
  it("removes old contents with no row, keeps fresh orphans and anything with a row", async () => {
    const now = new Date();
    const oldOrphan = newStorageKey(now);
    const freshOrphan = newStorageKey(now);
    await fileStore.put(oldOrphan, Buffer.from("old"), "text/plain");
    await fileStore.put(freshOrphan, Buffer.from("fresh"), "text/plain");
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    await utimes(path.resolve(config.FILE_STORAGE_DIR, ...oldOrphan.split("/")), twoDaysAgo, twoDaysAgo);
    const kept = await withFileTransaction((_tx, files) => files.save(input("has a row")));
    await utimes(path.resolve(config.FILE_STORAGE_DIR, ...kept.storageKey.split("/")), twoDaysAgo, twoDaysAgo);

    const removed = await sweepOrphanFiles({ now, months: 1 });

    expect(removed).toContain(oldOrphan);
    await expect(fileStore.get(oldOrphan)).rejects.toThrow();
    expect((await fileStore.get(freshOrphan)).toString()).toBe("fresh");
    expect((await fileStore.get(kept.storageKey)).toString()).toBe("has a row");
  });
});
```

```bash
npm run test:fresh -- test/core/files.test.ts
```

Expected: FAIL (ไม่มี `files-sweep.js`)

- [ ] **Step 2: สร้าง `scripts/files-sweep.ts`**

```ts
import { pathToFileURL } from "node:url";
import { fileStore } from "../src/core/file-store.js";
import { prisma } from "../src/db.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** "YYYY/MM/" for this month and the `months - 1` months before it (UTC). */
function monthPrefixes(now: Date, months: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/`);
  }
  return out;
}

/**
 * Removes contents in fileStore that have no `files` row and are older than one day (shared plan 2.9):
 * uploads whose transaction rolled back, or rows whose contents could not be removed after delete.
 * Returns the removed storage keys.
 */
export async function sweepOrphanFiles(opts: { now?: Date; months?: number; minAgeMs?: number } = {}): Promise<string[]> {
  const now = opts.now ?? new Date();
  const cutoff = now.getTime() - (opts.minAgeMs ?? DAY_MS);
  const removed: string[] = [];
  for (const prefix of monthPrefixes(now, opts.months ?? 12)) {
    const objects = await fileStore.list(prefix);
    if (objects.length === 0) continue;
    const known = new Set(
      (await prisma.file.findMany({ where: { storageKey: { startsWith: prefix } }, select: { storageKey: true } })).map(
        (f) => f.storageKey,
      ),
    );
    for (const o of objects) {
      if (known.has(o.key) || o.createdAt.getTime() > cutoff) continue;
      await fileStore.remove(o.key);
      removed.push(o.key);
    }
  }
  return removed;
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const removed = await sweepOrphanFiles();
    console.log(`files sweep: removed ${removed.length} orphaned file(s)`);
  } finally {
    await prisma.$disconnect();
  }
}
```

`package.json` เพิ่ม script `"files:sweep": "tsx --env-file=.env scripts/files-sweep.ts"`

- [ ] **Step 3: รันและ commit**

```bash
npm run test:fresh -- test/core/files.test.ts
npx tsc --noEmit
git add scripts/files-sweep.ts package.json test/core/files.test.ts
git commit -m "feat(core): sweep orphaned file contents older than a day"
```

Expected: test ใน `files.test.ts` ผ่านทั้งหมด

---

### Task F10: เอกสาร

**Files:**
- Modify: `prototype-1/backend/src/core/README.md`

- [ ] **Step 1: เพิ่มคำอธิบาย**

ใน `src/core/README.md` ต่อจากบรรทัด `audit.ts` เพิ่ม

```markdown
- `files.ts` — ไฟล์ของทุกโมดูล (แผนของกลางหัวข้อ 2.9) เนื้อไฟล์อยู่ใน `fileStore` (`file-store.ts`, เลือกด้วย `FILE_STORAGE`: `local` = โฟลเดอร์ `FILE_STORAGE_DIR`, `supabase` = bucket แบบ private) แถวอยู่ในตาราง `files`. เขียนผ่าน `withFileTransaction(async (tx, files) => { const f = await files.save({ buffer, mime, originalName, module, uploadedBy }); ... })` ซึ่งลบเนื้อไฟล์ให้ถ้า transaction ล้ม แล้วเก็บ `f.id` ในตารางของโมดูล (`file_id`). อ่านด้วย `readFile(fileId)` หลังตรวจสิทธิ์ใน route ของโมดูลเสมอ ห้ามส่งลิงก์ของ bucket ให้ผู้ใช้. ลบด้วย `deleteFileRecord(tx, fileId)` ใน transaction แล้ว `removeStoredFile(key)` หลัง commit. `npm run files:sweep` ลบเนื้อไฟล์ที่ไม่มีแถวและอายุเกินหนึ่งวัน, `npm run files:backfill` ย้ายไฟล์ที่บันทึกก่อนขั้นที่ 6
```

- [ ] **Step 2: commit**

```bash
git add src/core/README.md
git commit -m "docs(core): describe files.ts and the file scripts"
```

---

### Task F11: ตรวจรอบสุดท้าย

- [ ] **Step 1: test ทั้งหมดและ drift**

```bash
cd prototype-1/backend
npx tsc --noEmit
npm run test:fresh
```

Expected: ผ่านทั้งหมดยกเว้น BR-14

```bash
npx prisma migrate diff --from-migrations prisma/schema/migrations --to-schema-datamodel prisma/schema \
  --shadow-database-url "<disposable DB URL>" --script
```

Expected: เหลือแค่บรรทัด `booking_occurrences.timeslot` ที่รู้กันอยู่แล้ว

```bash
cd ../frontend && npm run typecheck && npm test && npm run build
```

Expected: ผ่าน (API ของรูปข่าวและ PDF ไม่เปลี่ยน frontend จึงไม่ต้องแก้)

- [ ] **Step 2: ลองในเบราว์เซอร์ (`FILE_STORAGE=local`)**

- ล็อกอินเจ้าหน้าที่ สร้างข่าวพร้อมรูป 1 รูป เห็นรูปในหน้าแก้ไข ลบรูปแล้วรูปหายจากหน้าและไฟล์หายจาก `storage/`
- เปิดหน้าข่าวที่ seed ไว้ เห็นรูปโปสเตอร์
- คำร้องลด-ถอนรายวิชา: เจ้าหน้าที่แนบ PDF แล้วดาวน์โหลดได้ ล็อกอินเป็นนิสิตอีกคนแล้วดาวน์โหลดไม่ได้

- [ ] **Step 3: PR (เมื่อได้รับอนุญาต)**

"Core step 6: files table and fileStore" base `main` label `shared` สรุปการตัดสินใจ ผลตรวจ ขั้นตอนย้ายข้อมูลสำหรับฐานข้อมูลที่มีข้อมูลเดิม (Task F8: deploy → backfill → resolve → deploy) และบอกว่า driver `supabase` ทดสอบด้วย fetch ปลอมเท่านั้น ต้องทดสอบกับ bucket จริงตอน deploy ท้าย body `🤖 Generated with [Claude Code](https://claude.com/claude-code)`

- [ ] **Step 4: หลัง merge**

อัปเดต [คู่มือ deploy](../../deploy/render-supabase-vercel.md): หัวข้อ 0 (รูปข่าวไม่หายแล้ว), หัวข้อ 2 ข้อ 5 (ชื่อตัวแปร `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`), หัวข้อ 3 (ตั้ง `FILE_STORAGE=supabase` ใน Render) และตารางแก้ปัญหา
