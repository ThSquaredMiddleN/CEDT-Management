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
