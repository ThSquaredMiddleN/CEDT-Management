/**
 * Fakes a LINE webhook call, so the LINE flow can be tried with no LINE account, phone or tunnel.
 * Builds a LINE-shaped body, signs its exact bytes with LINE_CHANNEL_SECRET, and POSTs it to the backend.
 * With LINE_DRY_RUN=true in backend/.env, the backend console shows the replies and pushes it makes.
 *
 * Usage: npm run line:sim -- <follow|message|unfollow> [--user <id>] [--text <msg>] [--redelivery] [--url <base>]
 */
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

/** Must pass routes.ts (LINE_USER_ID = /^U[0-9a-f]{32}$/); anything else is dropped before the handler runs. */
export const DEFAULT_USER_ID = `U${"0".repeat(31)}1`;
export const DEFAULT_TEXT = "hi";
export const DEFAULT_URL = "http://localhost:3000";
export const WEBHOOK_PATH = "/api/v1/line/webhook";
const DESTINATION = `U${"0".repeat(31)}f`;

export const EVENT_TYPES = ["follow", "message", "unfollow"] as const;
export type SimEventType = (typeof EVENT_TYPES)[number];

export interface SimOptions {
  type: SimEventType;
  userId?: string;
  text?: string;
  redelivery?: boolean;
}

/** One LINE webhook body with a single event, as JSON text. Follow and message get a reply token; unfollow has none. */
export function buildWebhookBody(opts: SimOptions): string {
  const event: Record<string, unknown> = {
    type: opts.type,
    mode: "active",
    timestamp: Date.now(),
    source: { type: "user", userId: opts.userId ?? DEFAULT_USER_ID },
    webhookEventId: randomUUID().replace(/-/g, ""),
    deliveryContext: { isRedelivery: opts.redelivery === true },
  };
  if (opts.type !== "unfollow") event.replyToken = randomBytes(16).toString("hex");
  if (opts.type === "message") {
    event.message = { type: "text", id: String(Date.now()), text: opts.text ?? DEFAULT_TEXT };
  }
  return JSON.stringify({ destination: DESTINATION, events: [event] });
}

/** base64 HMAC-SHA256 over the UTF-8 bytes of the body, the value LINE sends in x-line-signature. */
export function signBody(body: string, channelSecret: string): string {
  return createHmac("sha256", channelSecret).update(Buffer.from(body, "utf8")).digest("base64");
}

export type ParsedArgs = SimOptions & { url: string };

/** Parses the CLI arguments after `--`. Throws an Error with a message for the user on bad input. */
export function parseSimArgs(argv: string[]): ParsedArgs {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      user: { type: "string" },
      text: { type: "string" },
      redelivery: { type: "boolean" },
      url: { type: "string" },
    },
  });
  const [type, ...extra] = positionals;
  if (!EVENT_TYPES.includes(type as SimEventType) || extra.length > 0) {
    throw new Error(`Usage: npm run line:sim -- <${EVENT_TYPES.join("|")}> [--user <id>] [--text <msg>] [--redelivery] [--url <base>]`);
  }
  return {
    type: type as SimEventType,
    userId: values.user,
    text: values.text,
    redelivery: values.redelivery,
    url: values.url ?? DEFAULT_URL,
  };
}

async function run(argv: string[]): Promise<number> {
  let args: ParsedArgs;
  try {
    args = parseSimArgs(argv);
  } catch (err) {
    console.error((err as Error).message);
    return 2;
  }

  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) {
    console.error("LINE_CHANNEL_SECRET is not set. Add it to backend/.env (the value the backend uses) and run again.");
    return 1;
  }

  let target: string;
  try {
    target = new URL(WEBHOOK_PATH, args.url.endsWith("/") ? args.url : `${args.url}/`).toString();
  } catch {
    console.error(`--url is not a valid URL: ${args.url}`);
    return 2;
  }

  const body = buildWebhookBody(args);
  let res: Response;
  try {
    res = await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json", "x-line-signature": signBody(body, secret) },
      body: Buffer.from(body, "utf8"),
    });
  } catch {
    console.error(`Could not reach ${target}. Is the backend running?`);
    return 1;
  }

  const text = (await res.text()).slice(0, 200);
  console.log(`${args.type} for ${args.userId ?? DEFAULT_USER_ID} -> ${target}: HTTP ${res.status} ${text}`);
  if (res.status === 401) console.log("401: the backend's LINE_CHANNEL_SECRET differs from this one (same backend/.env).");
  if (res.status === 404) console.log("404: LINE is off in the backend. Set LINE_DRY_RUN=true and restart npm run dev.");
  if (res.ok) console.log("Replies and pushes appear in the backend console (LINE_DRY_RUN=true).");
  return res.ok ? 0 : 1;
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  run(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
