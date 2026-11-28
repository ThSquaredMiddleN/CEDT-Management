import http from "node:http";
import type { AddressInfo } from "node:net";

/** A made-up name. The fake sidecar returns it as a field, as the real one does; it must never reach the DB. */
export const MADE_UP_NAME = "นาย ทดสอบ ตัวอย่าง";

/** A 2x2 white JPEG, base64: the stand-in for the sidecar's stored copy of a receipt. */
export const TINY_JPEG_B64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABsSFBcUERsXFhceHBsgKEIrKCUlKFE6PTBCYFVlZF9VXVtqeJmBanGQc1tdhbWGkJ6jq62rZ4C8ybqmx5moq6T/2wBDARweHigjKE4rK06kbl1upKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKT/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDpqKKKAP/Z";
export const TINY_JPEG = Buffer.from(TINY_JPEG_B64, "base64");

export interface SidecarCall {
  term: string | null;
  studentId: string | null;
  contentType: string | undefined;
  bytes: Buffer;
}

export interface SidecarReply {
  status: number;
  body?: unknown;
  delayMs?: number;
  /** The fake answers only after this promise settles, so a test can finish other requests during the OCR call. */
  hold?: Promise<unknown>;
}

export interface FakeSidecar {
  url: string;
  calls: SidecarCall[];
  /** Tests replace this to choose the answer for each upload. */
  reply: (call: SidecarCall) => SidecarReply;
  close: () => Promise<void>;
}

export interface SidecarCheckRow {
  name: string;
  state: "ok" | "warn" | "fail" | "info";
  detail: string;
}

/** Answer shaped like the real sidecar's 200 response, with made-up values. */
export function sidecarOk(
  call: SidecarCall,
  opts: {
    kind?: "pdf" | "screenshot";
    reference?: string | null;
    checks?: SidecarCheckRow[];
    /** false: the sidecar sends `stored_copy: null`, as when it has no copy to give. Default: a small JPEG. */
    storedCopy?: boolean;
  } = {},
): SidecarReply {
  const kind = opts.kind ?? "pdf";
  const reference = opts.reference === undefined ? "RC-TEST-0001" : opts.reference;
  const term = call.term ?? "";
  const fields: Record<string, { value: string; box: number[] | null; pii: boolean }> = {
    semester: { value: term, box: null, pii: false },
    name: { value: MADE_UP_NAME, box: [10, 20, 200, 40], pii: true },
    student_id: { value: call.studentId ?? "", box: null, pii: true },
    amount: { value: "1,500.00", box: null, pii: false },
    paid_at: { value: "1 ก.ค. 2599 10:00", box: null, pii: false },
    funding: { value: "", box: null, pii: false },
  };
  if (kind === "pdf") {
    if (reference) fields.receipt_no = { value: reference, box: null, pii: true };
  } else {
    fields.status = { value: "ชำระเงินสำเร็จ", box: null, pii: false };
    if (reference) fields.reference = { value: reference, box: null, pii: true };
  }
  const defaultChecks: SidecarCheckRow[] = [
    { name: "All key fields read", state: "ok", detail: "4 of 4 found" },
    { name: "Payment completed", state: "ok", detail: "official receipt" },
    { name: "Current semester", state: "ok", detail: `receipt ${term}, expected ${term}` },
    { name: "Belongs to this student", state: "ok", detail: "full ID matches" },
  ];
  if (reference) {
    defaultChecks.push({
      name: "Not submitted before",
      state: "ok",
      detail: "reference not seen before (this session)",
    });
  }
  return {
    status: 200,
    body: {
      kind,
      fields,
      checks: opts.checks ?? defaultChecks,
      stored_copy: opts.storedCopy === false ? null : { mime: "image/jpeg", data: TINY_JPEG_B64 },
    },
  };
}

/** The sidecar's answer when it cannot read the image (its 422 body). */
export function sidecarUnreadable(): SidecarReply {
  return { status: 422, body: { error: "could not read this image" } };
}

/** Local stand-in for the Python OCR sidecar. Listens on a random localhost port. */
export async function startFakeSidecar(): Promise<FakeSidecar> {
  const calls: SidecarCall[] = [];
  const fake: FakeSidecar = {
    url: "",
    calls,
    reply: (call) => sidecarOk(call),
    close: async () => {},
  };

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const u = new URL(req.url ?? "/", "http://fake.local");
      const call: SidecarCall = {
        term: u.searchParams.get("term"),
        studentId: u.searchParams.get("student_id"),
        contentType: req.headers["content-type"],
        bytes: Buffer.concat(chunks),
      };
      calls.push(call);
      const r = fake.reply(call);
      void Promise.resolve(r.hold).then(() => {
        setTimeout(() => {
          if (res.destroyed) return;
          res.writeHead(r.status, { "content-type": "application/json" });
          res.end(JSON.stringify(r.body ?? { error: "fake" }));
        }, r.delayMs ?? 0);
      });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  fake.close = () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  return fake;
}
