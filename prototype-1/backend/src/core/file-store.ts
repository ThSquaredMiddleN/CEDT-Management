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
