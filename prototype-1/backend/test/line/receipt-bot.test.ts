import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { config } from "../../src/config.js";
import { prisma } from "../../src/db.js";
import { intentOf } from "../../src/modules/line/bot.js";
import { currentTerm, lineSummary } from "../../src/modules/receipts/service.js";
import { cleanLineState, fakeLine, lineEvent, LINE_A, postWebhook, tokenFrom, webhookBody, type FakeLine, type SentMessage } from "./fixtures.js";

/**
 * Chatbot step 2: a linked student asks for their receipt status. Rows are created directly (the OCR stub is not
 * needed: only the stored verdict and who checked it matter). Every reference, amount and name below is made up.
 */

const S_OWN = "6800000001"; // student@test.local
const S_OWN2 = "6800000002"; // student2@test.local
const REF = "RC-LINEBOT-SECRET-REF";
const AMOUNT = "9,876.54";
const FUNDING_NOTE = "กยศ. ทดสอบ-ลับ";
const OTHER_NOTE = "student 6899999999 holds the same reference";

const NO_ROW = "ยังไม่ได้ส่งใบเสร็จภาคการศึกษานี้";
const RESEND = "ส่งใหม่ได้ที่หน้าเว็บ";
const STUDENT_ONLY = "เมนูนี้สำหรับนักศึกษา";
const NO_PERMISSION = "บัญชีนี้ยังไม่มีสิทธิ์ดูสถานะใบเสร็จ ติดต่อเจ้าหน้าที่";
const LOCKED_NOTE = "หากต้องการเปลี่ยน กรุณาติดต่อเจ้าหน้าที่";
const RECEIPT_LINK = `${config.APP_ORIGIN}/receipts`;

let app: FastifyInstance;
let line: FakeLine;
let studentId: string;
let student2Id: string;
let staffId: string;

const lastQuickLabels = (m: SentMessage): string[] => (m.messages.at(-1)?.quickReply?.items ?? []).map((i) => i.action.label);

async function ask(text: string): Promise<SentMessage> {
  line.reset();
  const res = await postWebhook(app, webhookBody([lineEvent({ type: "message", userId: LINE_A, text })]));
  expect(res.statusCode).toBe(200);
  expect(line.sent).toHaveLength(1);
  return line.sent[0]!;
}

async function linkAs(email: string): Promise<void> {
  const { id } = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
  await prisma.lineAccount.create({ data: { userId: id, lineUserId: LINE_A, linkedAt: new Date() } });
}

async function addRow(studentNo: string, verdict: "ok" | "warn" | "fail", checkedById: string): Promise<void> {
  await prisma.receiptCheck.create({
    data: {
      studentId: studentNo,
      term: currentTerm(),
      kind: "pdf",
      reference: REF,
      amount: AMOUNT,
      funding: FUNDING_NOTE,
      verdict,
      checkedById,
      checks: [
        { name: "All key fields read", state: "ok", detail: "4 of 4 found" },
        { name: "Not submitted before", state: verdict === "ok" ? "ok" : verdict, detail: OTHER_NOTE },
        { name: "Funding", state: "info", detail: FUNDING_NOTE },
      ],
    },
  });
}

/** Runs `fn` with the student role's receipts.use removed, and puts it back afterwards. */
async function withoutReceiptsUse(fn: () => Promise<void>): Promise<void> {
  const role = await prisma.role.findUniqueOrThrow({ where: { key: "student" }, select: { id: true } });
  await prisma.rolePermission.deleteMany({ where: { roleId: role.id, permission: "receipts.use" } });
  try {
    await fn();
  } finally {
    await prisma.rolePermission.createMany({ data: [{ roleId: role.id, permission: "receipts.use" }], skipDuplicates: true });
  }
}

/** What a student must never see in the reply: values from the row, IDs (internal user IDs too), check details. */
function expectNoLeak(m: SentMessage): void {
  for (const secret of [studentId, student2Id, staffId, REF, AMOUNT, FUNDING_NOTE, OTHER_NOTE, "6899999999", S_OWN, S_OWN2, "นิสิต ทดสอบ", "Funding", "Not submitted", "4 of 4"]) {
    expect(m.text).not.toContain(secret);
  }
}

beforeAll(async () => {
  line = fakeLine();
  app = await buildApp({ lineClient: line.client });
  await app.ready();
  const id = async (email: string) => (await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } })).id;
  studentId = await id("student@test.local");
  student2Id = await id("student2@test.local");
  staffId = await id("staff@test.local");
});

beforeEach(async () => {
  line.reset();
  await cleanLineState();
  await prisma.receiptCheck.deleteMany({ where: { studentId: { in: [S_OWN, S_OWN2] } } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await cleanLineState();
  await prisma.receiptCheck.deleteMany({ where: { studentId: { in: [S_OWN, S_OWN2] } } });
  await app.close();
});

describe("receipt intent", () => {
  it.each(["ใบเสร็จ", "สถานะใบเสร็จ", "receipt", "Receipt ", "ใบเสร็จค่าเทอม", "ค่าเทอม", "สถานะค่าเทอม", " ค่าเทอม ", "receipts"])("%j is receipt", (text) => {
    expect(intentOf(text).kind).toBe("receipt");
  });

  it.each(["reception", "เสร็จแล้ว", "ค่าเทอมแพงมาก", "ค่าเทอมเท่าไหร่ต้องจ่ายเมื่อไหร่", "ถามเรื่องค่าเทอม", "ใบเสนอราคา", "ค่าห้อง", "ค่าธรรมเนียม", "recipe", "สวัสดี"])("near miss %j is not receipt", (text) => {
    expect(intentOf(text).kind).not.toBe("receipt");
  });

  it("does not take over the older intents", () => {
    expect(intentOf("ข่าว").kind).toBe("news");
    expect(intentOf("ประกาศ").kind).toBe("announcements");
    expect(intentOf("คำถาม").kind).toBe("faqList");
    expect(intentOf("เชื่อม").kind).toBe("link");
    expect(intentOf("unlink").kind).toBe("faq");
    expect(intentOf("ยกเลิกการจอง").kind).toBe("unknown");
  });
});

describe("lineSummary", () => {
  it("says why when there is no summary: no student number, no permission, unknown user", async () => {
    expect(await lineSummary(staffId)).toEqual({ reason: "not-student" });
    expect(await lineSummary("00000000-0000-4000-8000-000000000000")).toEqual({ reason: "no-permission" });
    await withoutReceiptsUse(async () => {
      expect(await lineSummary(studentId)).toEqual({ reason: "no-permission" });
    });
  });

  it("returns text and the /receipts path for a student", async () => {
    const s = await lineSummary(studentId);
    expect(s).toEqual({ text: NO_ROW, link: "/receipts" });
  });
});

describe("receipt status, linked student", () => {
  beforeEach(async () => {
    await linkAs("student@test.local");
  });

  it("no row for this term: says nothing was sent, link /receipts, no ID", async () => {
    const m = await ask("ใบเสร็จ");
    expect(m.messages).toHaveLength(1);
    expect(m.text).toContain(NO_ROW);
    expect(m.text).toContain(RECEIPT_LINK);
    expect(m.text).not.toContain(RESEND);
    expectNoLeak(m);
    expect(tokenFrom(m.text)).toBeUndefined();
    expect(lastQuickLabels(m)).toEqual(["ข่าว", "ประกาศ", "คำถามที่พบบ่อย", "เมนู", "ใบเสร็จ"]);
  });

  it("own check, warn: waits for staff, not checked by staff, can resend", async () => {
    await addRow(S_OWN, "warn", studentId);
    const m = await ask("สถานะใบเสร็จ");
    expect(m.text).toContain("รอเจ้าหน้าที่ตรวจ");
    expect(m.text).toContain(RESEND);
    expect(m.text).not.toContain("เจ้าหน้าที่ตรวจแล้ว");
    expect(m.text).not.toContain(LOCKED_NOTE);
    expect(m.text).toContain(RECEIPT_LINK);
    expectNoLeak(m);
  });

  it("own check, fail: not passed, can resend", async () => {
    await addRow(S_OWN, "fail", studentId);
    const m = await ask("receipt");
    expect(m.text).toContain("ไม่ผ่าน");
    expect(m.text).toContain(RESEND);
    expectNoLeak(m);
  });

  it("own check, ok: passed, no resend", async () => {
    await addRow(S_OWN, "ok", studentId);
    const m = await ask("ค่าเทอม");
    expect(m.text).toContain("ผ่าน");
    expect(m.text).not.toContain("ไม่ผ่าน");
    expect(m.text).not.toContain("รอเจ้าหน้าที่ตรวจ");
    expect(m.text).not.toContain(RESEND);
    expect(m.text).toContain(LOCKED_NOTE);
    expect(m.text).toContain(RECEIPT_LINK);
    expectNoLeak(m);
  });

  it("staff-checked warn: says staff checked it, no resend", async () => {
    await addRow(S_OWN, "warn", staffId);
    const m = await ask("ใบเสร็จ");
    expect(m.text).toContain("เจ้าหน้าที่ตรวจแล้ว มีข้อสังเกต");
    expect(m.text).not.toContain("รอเจ้าหน้าที่ตรวจ");
    expect(m.text).toContain(LOCKED_NOTE);
    expect(m.text).not.toContain(RESEND);
    expect(m.text).toContain(RECEIPT_LINK);
    expectNoLeak(m);
  });

  it("staff-checked fail: not passed, staff checked, contact staff, no resend", async () => {
    await addRow(S_OWN, "fail", staffId);
    const m = await ask("ใบเสร็จ");
    expect(m.text).toContain("ไม่ผ่าน");
    expect(m.text).toContain("เจ้าหน้าที่ตรวจแล้ว");
    expect(m.text).toContain(LOCKED_NOTE);
    expect(m.text).not.toContain(RESEND);
    expectNoLeak(m);
  });

  it("staff-checked ok: passed and says staff checked", async () => {
    await addRow(S_OWN, "ok", staffId);
    const m = await ask("ใบเสร็จ");
    expect(m.text).toContain("ผ่าน");
    expect(m.text).not.toContain("ไม่ผ่าน");
    expect(m.text).toContain("เจ้าหน้าที่ตรวจแล้ว");
    expect(m.text).toContain(LOCKED_NOTE);
    expect(m.text).not.toContain(RESEND);
    expectNoLeak(m);
  });

  it("staff settled Pass: passed, says staff checked, no resend", async () => {
    await addRow(S_OWN, "ok", staffId);
    await prisma.receiptCheck.updateMany({
      where: { studentId: S_OWN },
      data: { settlement: "pass", settledById: staffId, settledAt: new Date() },
    });
    const m = await ask("ใบเสร็จ");
    expect(m.text).toContain("ผ่าน (เจ้าหน้าที่ตรวจแล้ว)");
    expect(m.text).not.toContain("ไม่ผ่าน");
    expect(m.text).toContain(LOCKED_NOTE);
    expect(m.text).not.toContain(RESEND);
    expectNoLeak(m);
  });

  it("staff settled Fail: not passed, says upload again, never the staff note", async () => {
    const note = "SETTLE-NOTE-NOT-ON-LINE";
    // Staff-run, so only the Fail settlement unlocks it (a student's own fail row is open anyway).
    await addRow(S_OWN, "fail", staffId);
    await prisma.receiptCheck.updateMany({
      where: { studentId: S_OWN },
      data: { settlement: "fail", settleNote: note, settledById: staffId, settledAt: new Date() },
    });
    const m = await ask("ใบเสร็จ");
    expect(m.text).toContain("ไม่ผ่าน (เจ้าหน้าที่ตรวจแล้ว)");
    expect(m.text).toContain("ส่งใบเสร็จใหม่ได้ที่หน้าเว็บ");
    expect(m.text).not.toContain(LOCKED_NOTE);
    expect(m.text).not.toContain(note);
    expectNoLeak(m);
  });

  it("another student's row is never shown", async () => {
    await addRow(S_OWN2, "ok", student2Id);
    const m = await ask("ใบเสร็จ");
    expect(m.text).toContain(NO_ROW);
    expect(m.text).not.toContain("ผ่าน");
    expectNoLeak(m);
  });

  it("an older term's row does not count for this term", async () => {
    await prisma.receiptCheck.create({
      data: { studentId: S_OWN, term: "1/2500", kind: "pdf", verdict: "ok", checkedById: studentId, checks: [] },
    });
    try {
      const m = await ask("ใบเสร็จ");
      expect(m.text).toContain(NO_ROW);
    } finally {
      await prisma.receiptCheck.deleteMany({ where: { studentId: S_OWN, term: "1/2500" } });
    }
  });

  it("other intents still work and carry the receipt quick reply", async () => {
    const m = await ask("เมนู");
    expect(lastQuickLabels(m)).toEqual(["ข่าว", "ประกาศ", "คำถามที่พบบ่อย", "เมนู", "ใบเสร็จ"]);
    for (const item of m.messages.at(-1)!.quickReply!.items) expect(Array.from(item.action.label ?? "").length).toBeLessThanOrEqual(20);
  });
});

describe("receipt status, linked staff", () => {
  it("answers that the menu is for students, no status, no link issued", async () => {
    await linkAs("staff@test.local");
    await addRow(S_OWN, "ok", staffId);
    const m = await ask("ใบเสร็จ");
    expect(m.text).toContain(STUDENT_ONLY);
    expect(m.text).not.toContain(RECEIPT_LINK);
    expectNoLeak(m);
    expect(await prisma.lineLinkToken.count({ where: { lineUserId: LINE_A } })).toBe(0);
    expect(lastQuickLabels(m)).toEqual(["ข่าว", "ประกาศ", "คำถามที่พบบ่อย", "เมนู"]);
  });

  it("a staff account's menu has no receipt quick reply", async () => {
    await linkAs("staff@test.local");
    expect(lastQuickLabels(await ask("เมนู"))).toEqual(["ข่าว", "ประกาศ", "คำถามที่พบบ่อย", "เมนู"]);
  });
});

describe("receipt status, linked student without receipts.use", () => {
  it("says the account has no access, with no status and no receipt quick reply", async () => {
    await linkAs("student@test.local");
    await addRow(S_OWN, "ok", studentId);
    await withoutReceiptsUse(async () => {
      const m = await ask("ใบเสร็จ");
      expect(m.text).toContain(NO_PERMISSION);
      expect(m.text).not.toContain(STUDENT_ONLY);
      expect(m.text).not.toContain(RECEIPT_LINK);
      expectNoLeak(m);
      expect(lastQuickLabels(m)).toEqual(["ข่าว", "ประกาศ", "คำถามที่พบบ่อย", "เมนู"]);
    });
  });
});

describe("receipt status, account and event edge cases", () => {
  it("a deactivated linked student counts as unlinked: link offer, no status", async () => {
    await linkAs("student@test.local");
    await addRow(S_OWN, "ok", studentId);
    await prisma.user.update({ where: { id: studentId }, data: { isActive: false } });
    try {
      const m = await ask("ใบเสร็จ");
      expect(tokenFrom(m.text)).toBeDefined();
      expect(m.text).not.toContain(RECEIPT_LINK);
      expect(m.text).not.toContain("ผ่าน");
      expectNoLeak(m);
    } finally {
      await prisma.user.update({ where: { id: studentId }, data: { isActive: true } });
    }
  });

  it("relinking the LINE account to another student answers for the new student", async () => {
    await linkAs("student@test.local");
    await addRow(S_OWN, "ok", studentId);
    const before = await ask("ใบเสร็จ");
    expect(before.text).toContain("ผ่าน");

    await prisma.lineAccount.update({ where: { userId: studentId }, data: { userId: student2Id } });
    const after = await ask("ใบเสร็จ");
    expect(after.text).toContain(NO_ROW);
    expect(after.text).not.toContain("ผ่าน");
    expectNoLeak(after);
  });

  it("an event from a group chat is not answered", async () => {
    await linkAs("student@test.local");
    await addRow(S_OWN, "ok", studentId);
    const event = lineEvent({ type: "message", userId: LINE_A, text: "ใบเสร็จ" });
    event.source = { type: "group", groupId: `C${"0".repeat(32)}`, userId: LINE_A };
    const res = await postWebhook(app, webhookBody([event]));
    expect(res.statusCode).toBe(200);
    expect(line.sent).toHaveLength(0);
  });

  it("a redelivered request is pushed with the same status and no leak", async () => {
    await linkAs("student@test.local");
    await addRow(S_OWN, "ok", studentId);
    const res = await postWebhook(
      app,
      webhookBody([lineEvent({ type: "message", userId: LINE_A, text: "ใบเสร็จ", replyToken: "rt-stale", isRedelivery: true })]),
    );
    expect(res.statusCode).toBe(200);
    expect(line.sent).toHaveLength(1);
    const m = line.sent[0]!;
    expect(m.kind).toBe("push");
    expect(m.to).toBe(LINE_A);
    expect(m.text).toContain("ผ่าน");
    expect(m.text).toContain(RECEIPT_LINK);
    expectNoLeak(m);
  });

  it("a failing summary answers 500 without ids in the body, and sends nothing", async () => {
    await linkAs("student@test.local");
    vi.spyOn(prisma.receiptCheck, "findUnique").mockRejectedValueOnce(new Error(`boom ${S_OWN} ${studentId}`));
    const res = await postWebhook(app, webhookBody([lineEvent({ type: "message", userId: LINE_A, text: "ใบเสร็จ" })]));
    expect(res.statusCode).toBe(500);
    for (const secret of [S_OWN, studentId, LINE_A, "boom"]) expect(res.body).not.toContain(secret);
    expect(line.sent).toHaveLength(0);
  });
});

describe("receipt status, unlinked", () => {
  it("asks to link with a one-time link and shows no status", async () => {
    await addRow(S_OWN, "ok", studentId);
    const m = await ask("ใบเสร็จ");
    expect(tokenFrom(m.text)).toBeDefined();
    expect(m.text).not.toContain(RECEIPT_LINK);
    expectNoLeak(m);
    expect(lastQuickLabels(m)).toContain("เชื่อมบัญชี");
    expect(lastQuickLabels(m)).not.toContain("ใบเสร็จ");
    expect(await prisma.lineLinkToken.count({ where: { lineUserId: LINE_A } })).toBe(1);
  });

  it("with a live link already out, asks to link but issues no second link", async () => {
    const first = await ask("ใบเสร็จ");
    const token = tokenFrom(first.text)!;
    const second = await ask("ใบเสร็จ");
    expect(tokenFrom(second.text)).toBeUndefined();
    expect(second.text).toContain("เชื่อม");
    expect(second.text).not.toContain(token);
    expect(await prisma.lineLinkToken.count({ where: { lineUserId: LINE_A } })).toBe(1);
  });
});
