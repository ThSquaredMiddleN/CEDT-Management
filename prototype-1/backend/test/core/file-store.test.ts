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
