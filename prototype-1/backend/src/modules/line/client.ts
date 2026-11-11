/**
 * The LINE Messaging API calls this app makes. Every method returns a result instead of throwing,
 * so the dispatcher can tell a permanent failure (drop it) from a retryable one (try next tick).
 * Errors never carry the token, the request body or the message text.
 */

export type LineMessage = { type: "text"; text: string };

export type LineResult =
  | { ok: true }
  /** `status` is null when no response arrived (network error or timeout). */
  | { ok: false; status: number | null; permanent: boolean };

export interface LineClient {
  reply(replyToken: string, messages: LineMessage[]): Promise<LineResult>;
  /**
   * Sends messages to one user ID without a reply token. retryKey is a UUID: LINE answers 409 when it
   * already accepted that key, which means an earlier attempt went through, so it counts as ok.
   */
  push(to: string, messages: LineMessage[], retryKey: string): Promise<LineResult>;
}

/** The subset of fetch this client uses. Tests pass a fake; production uses the global fetch. */
export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

const API = "https://api.line.me/v2/bot/message";
const TIMEOUT_MS = 5000;

/**
 * 4xx other than 429 will not succeed on retry (bad token, bad reply token, bad user ID).
 * 429, 5xx and network failures are retryable.
 */
export function isPermanentStatus(status: number): boolean {
  return status >= 400 && status < 500 && status !== 429;
}

export function createLineClient(accessToken: string, fetchImpl: FetchFn = fetch): LineClient {
  async function post(
    path: string,
    body: unknown,
    extraHeaders: Record<string, string> = {},
    acceptStatus?: number,
  ): Promise<LineResult> {
    let res: Response;
    try {
      res = await fetchImpl(`${API}/${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          ...extraHeaders,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      // Network and timeout errors can carry details we do not want in logs: drop them.
      return { ok: false, status: null, permanent: false };
    }
    await res.body?.cancel();
    if (res.ok || res.status === acceptStatus) return { ok: true };
    return { ok: false, status: res.status, permanent: isPermanentStatus(res.status) };
  }

  return {
    reply(replyToken, messages) {
      return post("reply", { replyToken, messages });
    },
    push(to, messages, retryKey) {
      return post("push", { to, messages }, { "X-Line-Retry-Key": retryKey }, 409);
    },
  };
}
