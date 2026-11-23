import { describe, expect, it } from "vitest";
import { createLineClient, type FetchFn, type LineMessage } from "../../src/modules/line/client.js";

const TOKEN = "fake-access-token";
const RETRY_KEY = "11111111-2222-4333-8444-555555555555";
const MESSAGES: LineMessage[] = [{ type: "text", text: "test" }];

interface Call {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/** A fake fetch that records each call and answers with the given status (or throws). */
function fakeFetch(status: number | "network"): { fetch: FetchFn; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchFn = async (url, init) => {
    calls.push({
      url,
      headers: init.headers as Record<string, string>,
      body: JSON.parse(String(init.body)),
    });
    if (status === "network") throw new TypeError("fetch failed");
    return new Response(status === 200 ? "{}" : '{"message":"x"}', { status });
  };
  return { fetch, calls };
}

describe("createLineClient.push", () => {
  it("returns ok on 200 and sends auth, retry key and JSON body to the push endpoint", async () => {
    const { fetch, calls } = fakeFetch(200);
    const client = createLineClient(TOKEN, fetch);

    const result = await client.push("Uxxxxxxxx0000000000000000000000001", MESSAGES, RETRY_KEY);

    expect(result).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe("https://api.line.me/v2/bot/message/push");
    expect(call?.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(call?.headers["Content-Type"]).toBe("application/json");
    expect(call?.headers["X-Line-Retry-Key"]).toBe(RETRY_KEY);
    expect(call?.body).toEqual({ to: "Uxxxxxxxx0000000000000000000000001", messages: MESSAGES });
  });

  it("returns a retryable failure on 429", async () => {
    const { fetch } = fakeFetch(429);
    const result = await createLineClient(TOKEN, fetch).push("Uxxxxxxxx0000000000000000000000001", MESSAGES, RETRY_KEY);
    expect(result).toEqual({ ok: false, status: 429, permanent: false });
  });

  it("returns a retryable failure on 5xx", async () => {
    const { fetch } = fakeFetch(503);
    const result = await createLineClient(TOKEN, fetch).push("Uxxxxxxxx0000000000000000000000001", MESSAGES, RETRY_KEY);
    expect(result).toEqual({ ok: false, status: 503, permanent: false });
  });

  it("returns a permanent failure on 400", async () => {
    const { fetch } = fakeFetch(400);
    const result = await createLineClient(TOKEN, fetch).push("Uxxxxxxxx0000000000000000000000001", MESSAGES, RETRY_KEY);
    expect(result).toEqual({ ok: false, status: 400, permanent: true });
  });

  it("treats 409 with a retry key as already accepted (ok)", async () => {
    const { fetch } = fakeFetch(409);
    const result = await createLineClient(TOKEN, fetch).push("Uxxxxxxxx0000000000000000000000001", MESSAGES, RETRY_KEY);
    expect(result).toEqual({ ok: true });
  });

  it("returns a retryable failure with no status when the request never gets a response", async () => {
    const { fetch } = fakeFetch("network");
    const result = await createLineClient(TOKEN, fetch).push("Uxxxxxxxx0000000000000000000000001", MESSAGES, RETRY_KEY);
    expect(result).toEqual({ ok: false, status: null, permanent: false });
    // The failure result carries no error text, so nothing from the request can leak into logs.
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });
});

describe("createLineClient.reply", () => {
  it("posts to the reply endpoint without a retry key", async () => {
    const { fetch, calls } = fakeFetch(200);
    const result = await createLineClient(TOKEN, fetch).reply("fake-reply-token", MESSAGES);

    expect(result).toEqual({ ok: true });
    const [call] = calls;
    expect(call?.url).toBe("https://api.line.me/v2/bot/message/reply");
    expect(call?.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(call?.headers["X-Line-Retry-Key"]).toBeUndefined();
    expect(call?.body).toEqual({ replyToken: "fake-reply-token", messages: MESSAGES });
  });

  it("returns a permanent failure on 400 (for example an expired reply token)", async () => {
    const { fetch } = fakeFetch(400);
    const result = await createLineClient(TOKEN, fetch).reply("fake-reply-token", MESSAGES);
    expect(result).toEqual({ ok: false, status: 400, permanent: true });
  });

  it("does not treat 409 as ok on reply", async () => {
    const { fetch } = fakeFetch(409);
    const result = await createLineClient(TOKEN, fetch).reply("fake-reply-token", MESSAGES);
    expect(result).toEqual({ ok: false, status: 409, permanent: true });
  });
});
