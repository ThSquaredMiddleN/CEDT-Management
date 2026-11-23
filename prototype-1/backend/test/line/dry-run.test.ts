import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDryRunLineClient } from "../../src/modules/line/client.js";

/** Fake LINE user ID (passes the "U" + 32 hex shape check). Only ever appears in this file's assertions. */
const FAKE_ID = `U${"0".repeat(31)}c`;

describe("dry-run LINE client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns ok for reply and push, logs each full text, and never calls fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const logged: string[] = [];
    const client = createDryRunLineClient({ info: (m) => logged.push(m) });
    const link = "https://example.test/line/link?token=fake-token_123";

    expect(await client.reply("fakereplytoken", [{ type: "text", text: `hello ${link}` }])).toEqual({ ok: true });
    expect(
      await client.push(FAKE_ID, [{ type: "text", text: "line one" }, { type: "text", text: "line two" }], randomUUID()),
    ).toEqual({ ok: true });

    expect(logged).toEqual([
      `[LINE dry-run] reply to reply: hello ${link}`,
      `[LINE dry-run] push to ${FAKE_ID}: line one\nline two`,
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("LINE_DRY_RUN config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // config.ts reads process.env when it is first imported, so each case stubs the env and re-imports it.
  const cases = [
    { secret: "s", token: "", dry: "true", enabled: true, dryRun: true },
    { secret: "s", token: "", dry: "1", enabled: true, dryRun: true },
    { secret: "s", token: "t", dry: "true", enabled: true, dryRun: true },
    { secret: "s", token: "t", dry: "", enabled: true, dryRun: false },
    { secret: "s", token: "t", dry: "0", enabled: true, dryRun: false },
    { secret: "s", token: "", dry: "false", enabled: false, dryRun: false },
    { secret: "", token: "t", dry: "true", enabled: false, dryRun: false },
  ];

  it.each(cases)("secret=$secret token=$token dry=$dry gives enabled=$enabled dryRun=$dryRun", async (c) => {
    vi.stubEnv("LINE_CHANNEL_SECRET", c.secret);
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", c.token);
    vi.stubEnv("LINE_DRY_RUN", c.dry);
    vi.resetModules();
    const { lineEnabled, lineDryRun } = await import("../../src/config.js");
    expect(lineEnabled).toBe(c.enabled);
    expect(lineDryRun).toBe(c.dryRun);
  });

  it("rejects a value that is not true, false, 1 or 0", async () => {
    vi.stubEnv("LINE_DRY_RUN", "yes");
    vi.resetModules();
    await expect(import("../../src/config.js")).rejects.toThrow();
  });

  it("refuses dry-run in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LINE_CHANNEL_SECRET", "s");
    vi.stubEnv("LINE_DRY_RUN", "true");
    vi.resetModules();
    await expect(import("../../src/config.js")).rejects.toThrow(/production/);
  });
});
