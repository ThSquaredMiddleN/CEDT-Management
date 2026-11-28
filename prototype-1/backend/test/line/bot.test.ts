import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { config } from "../../src/config.js";
import { prisma } from "../../src/db.js";
import { intentOf } from "../../src/modules/line/bot.js";
import { FAQ } from "../../src/modules/line/faq.js";
import { hashToken } from "../../src/plugins/auth.js";
import {
  cleanLineState,
  fakeLine,
  lineEvent,
  LINE_A,
  postWebhook,
  tokenFrom,
  UUID,
  webhookBody,
  type FakeLine,
  type SentMessage,
} from "./fixtures.js";

/** Chatbot step 1: fixed keyword answers. Every title, ID and name below is fake test data. */

const PREFIX = "TESTBOT";
const FAR_FUTURE = new Date("2099-01-01T00:00:00Z");

let app: FastifyInstance;
let line: FakeLine;
let authorId: string;
let somchaiName: string;

async function ask(text: string): Promise<SentMessage> {
  const body = webhookBody([lineEvent({ type: "message", userId: LINE_A, text })]);
  const res = await postWebhook(app, body);
  expect(res.statusCode).toBe(200);
  expect(line.sent).toHaveLength(1);
  return line.sent[0]!;
}

async function linkSomchai(): Promise<void> {
  const { id, name } = await prisma.user.findUniqueOrThrow({ where: { email: "somchai@cedt.edu" }, select: { id: true, name: true } });
  somchaiName = name;
  await prisma.lineAccount.create({ data: { userId: id, lineUserId: LINE_A, linkedAt: new Date() } });
}

async function cleanContent(): Promise<void> {
  await prisma.newsArticle.deleteMany({ where: { title: { startsWith: PREFIX } } });
  await prisma.announcement.deleteMany({ where: { title: { startsWith: PREFIX } } });
}

const lastQuickLabels = (m: SentMessage): string[] =>
  (m.messages.at(-1)?.quickReply?.items ?? []).map((i) => i.action.label);

beforeAll(async () => {
  line = fakeLine();
  app = await buildApp({ lineClient: line.client });
  await app.ready();
  authorId = (await prisma.user.findUniqueOrThrow({ where: { email: "somchai@cedt.edu" }, select: { id: true } })).id;
  await cleanLineState();
  await cleanContent();
});

beforeEach(async () => {
  line.reset();
  await cleanLineState();
  await cleanContent();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await cleanLineState();
  await cleanContent();
  await app.close();
});

describe("intentOf", () => {
  it.each([
    ["เมนู", "menu"],
    ["  HELP ", "menu"],
    ["menu", "menu"],
    ["ช่วย", "menu"],
    ["?", "menu"],
    ["ข่าว", "news"],
    ["News", "news"],
    ["ขอดูข่าวหน่อย", "news"],
    ["ประกาศ", "announcements"],
    ["announcements", "announcements"],
    ["faq", "faqList"],
    ["คำถาม", "faqList"],
    ["เชื่อม", "link"],
    ["link", "link"],
    ["เชื่อมบัญชี", "link"],
    ["Link  Account ", "link"],
    ["blink 182", "unknown"],
    ["wifi เชื่อมต่อไม่ได้", "unknown"],
    ["เชื่อมั่น", "unknown"],
    ["link to the past", "unknown"],
    ["ประกาศนียบัตร", "unknown"],
    ["ประกาศล่าสุด", "announcements"],
    ["ข่\u200bาว", "news"],
    ["เมนู\u200b", "menu"],
    ["\ufeffhelp", "menu"],
    ["สวัสดี", "unknown"],
    ["what is this?", "unknown"],
    ["", "unknown"],
  ])("%j is %s", (text, kind) => {
    expect(intentOf(text).kind).toBe(kind);
  });

  it("matches each FAQ entry by its own keywords, ahead of the broader words", () => {
    FAQ.forEach((entry, index) => {
      for (const keyword of entry.keywords) expect(intentOf(keyword)).toEqual({ kind: "faq", index });
    });
    // "unlink" contains "link" but is the unlink entry, not the link intent.
    expect(intentOf("how do I unlink").kind).toBe("faq");
  });

  it("sends the unlink words to the unlink FAQ, spaces or not", () => {
    const unlink = FAQ.findIndex((entry) => entry.question.includes("ยกเลิก"));
    for (const text of ["ยกเลิกการเชื่อม", "unlink", "disconnect", "ยกเลิก เชื่อม", "ยกเลิก  เชื่อมบัญชี", "ยกเลิก LINE"]) {
      expect(intentOf(text)).toEqual({ kind: "faq", index: unlink });
    }
  });

  it("does not send other cancellations to the unlink FAQ", () => {
    for (const text of ["ยกเลิกการจอง", "ยกเลิกคำร้อง", "ยกเลิก"]) {
      expect(intentOf(text).kind).toBe("unknown");
    }
  });

  it("is the same for composed and decomposed Thai (NFC)", () => {
    expect(intentOf("ข่าว".normalize("NFD")).kind).toBe("news");
  });
});

describe("bot replies, unlinked user", () => {
  it("menu: intro and quick replies, no link", async () => {
    const m = await ask("เมนู");
    expect(m.kind).toBe("reply");
    expect(tokenFrom(m.text)).toBeUndefined();
    expect(lastQuickLabels(m)).toEqual(["ข่าว", "ประกาศ", "คำถามที่พบบ่อย", "เมนู", "เชื่อมบัญชี"]);
    expect(await prisma.lineLinkToken.count({ where: { lineUserId: LINE_A } })).toBe(0);
  });

  it("link: sends the one-time link", async () => {
    const m = await ask("เชื่อม");
    expect(tokenFrom(m.text)).toBeDefined();
    expect(lastQuickLabels(m)).toContain("เชื่อมบัญชี");
    expect(await prisma.lineLinkToken.count({ where: { lineUserId: LINE_A } })).toBe(1);
  });

  it("unknown text: says it cannot answer and still offers the link", async () => {
    const m = await ask("สวัสดีครับ");
    expect(m.messages).toHaveLength(2);
    expect(m.messages[0]!.text).toContain("ยังตอบเรื่องนี้ไม่ได้");
    expect(tokenFrom(m.messages[1]!.text)).toBeDefined();
    expect(m.messages[0]!.quickReply).toBeUndefined();
    expect(lastQuickLabels(m)).toHaveLength(5);
    expect(await prisma.lineLinkToken.count({ where: { lineUserId: LINE_A } })).toBe(1);
  });

  it("unknown text twice: the first link stays valid and no second one is issued", async () => {
    const first = await ask("hi");
    const token = tokenFrom(first.messages[1]!.text)!;
    expect(token).toBeDefined();
    line.reset();
    const second = await ask("ขอบคุณ");
    expect(second.messages).toHaveLength(1);
    expect(second.text).toContain("ยังตอบเรื่องนี้ไม่ได้");
    expect(tokenFrom(second.text)).toBeUndefined();
    expect(lastQuickLabels(second)).toContain("เชื่อมบัญชี");
    const rows = await prisma.lineLinkToken.findMany({ where: { lineUserId: LINE_A } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(hashToken(token));
  });

  it("unknown text after the link expired or was used issues a new one", async () => {
    await prisma.lineLinkToken.create({
      data: { tokenHash: hashToken("test-expired"), lineUserId: LINE_A, expiresAt: new Date(Date.now() - 1000) },
    });
    const m = await ask("hi");
    expect(tokenFrom(m.messages[1]!.text)).toBeDefined();
    line.reset();
    await prisma.lineLinkToken.updateMany({ where: { lineUserId: LINE_A }, data: { usedAt: new Date() } });
    const again = await ask("hi");
    expect(tokenFrom(again.messages[1]!.text)).toBeDefined();
  });

  it("an explicit link request issues a fresh link and replaces the old one", async () => {
    const first = await ask("เชื่อม");
    line.reset();
    const second = await ask("link");
    const rows = await prisma.lineLinkToken.findMany({ where: { lineUserId: LINE_A } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(hashToken(tokenFrom(second.text)!));
    expect(rows[0]!.tokenHash).not.toBe(hashToken(tokenFrom(first.text)!));
  });

  it.each(["blink 182", "wifi เชื่อมต่อไม่ได้", "เชื่อมั่น"])("%s is not a link request: no link issued", async (text) => {
    const m = await ask(text);
    // Unknown text from a user with no link gets the unknown message plus the link, as before.
    expect(m.messages[0]!.text).toContain("ยังตอบเรื่องนี้ไม่ได้");
    expect(await prisma.lineLinkToken.count({ where: { lineUserId: LINE_A } })).toBe(1);
  });

  it("a word that only contains link does not replace a link already issued", async () => {
    const first = await ask("เชื่อม");
    line.reset();
    const m = await ask("blink 182");
    expect(tokenFrom(m.text)).toBeUndefined();
    const rows = await prisma.lineLinkToken.findMany({ where: { lineUserId: LINE_A } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(hashToken(tokenFrom(first.text)!));
  });

  it("revokes the link when LINE rejects the reply to a text message", async () => {
    line.next({ ok: false, status: 400, permanent: true });
    const res = await postWebhook(app, webhookBody([lineEvent({ type: "message", userId: LINE_A, text: "เชื่อม" })]));
    expect(res.statusCode).toBe(200);
    expect(await prisma.lineLinkToken.count({ where: { lineUserId: LINE_A } })).toBe(0);
  });

  it("revokes the link and answers 500 when the reply to a text message fails for now", async () => {
    line.next({ ok: false, status: 503, permanent: false });
    const res = await postWebhook(app, webhookBody([lineEvent({ type: "message", userId: LINE_A, text: "hi" })]));
    expect(res.statusCode).toBe(500);
    expect(await prisma.lineLinkToken.count({ where: { lineUserId: LINE_A } })).toBe(0);
  });

  it("a redelivered text message is pushed with a retry key, not replied", async () => {
    const res = await postWebhook(
      app,
      webhookBody([lineEvent({ type: "message", userId: LINE_A, text: "เมนู", replyToken: "rt-stale", isRedelivery: true })]),
    );
    expect(res.statusCode).toBe(200);
    expect(line.sent).toHaveLength(1);
    const sent = line.sent[0]!;
    expect(sent.kind).toBe("push");
    expect(sent.to).toBe(LINE_A);
    expect(sent.retryKey).toMatch(UUID);
    expect(lastQuickLabels(sent)).toHaveLength(5);
  });

  it("faq list and an FAQ entry answer without a link", async () => {
    const list = await ask("faq");
    for (const entry of FAQ) expect(list.text).toContain(entry.question);
    expect(tokenFrom(list.text)).toBeUndefined();
    line.reset();
    const entry = await ask(FAQ[0]!.keywords[0]!);
    expect(entry.text).toContain(`${config.APP_ORIGIN}/line`);
    expect(await prisma.lineLinkToken.count({ where: { lineUserId: LINE_A } })).toBe(0);
  });

  it("news: published items only, newest first, at most 5, with links, also for unlinked users", async () => {
    const created: { id: string; n: number }[] = [];
    for (let n = 1; n <= 6; n++) {
      const row = await prisma.newsArticle.create({
        data: { title: `${PREFIX} news ${n}`, authorId, status: "published", publishedAt: new Date(FAR_FUTURE.getTime() + n * 60_000) },
      });
      created.push({ id: row.id, n });
    }
    await prisma.newsArticle.create({ data: { title: `${PREFIX} news draft`, authorId, status: "draft" } });

    const m = await ask("ข่าว");
    expect(m.messages).toHaveLength(1);
    expect(m.text).not.toContain("draft");
    expect(m.text).not.toContain(`${PREFIX} news 1\n`);
    for (const { id, n } of created.filter((c) => c.n >= 2)) {
      expect(m.text).toContain(`${PREFIX} news ${n}`);
      expect(m.text).toContain(`${config.APP_ORIGIN}/news/${id}`);
    }
    expect(m.text.indexOf(`${PREFIX} news 6`)).toBeLessThan(m.text.indexOf(`${PREFIX} news 2`));
    expect(lastQuickLabels(m)).toContain("เชื่อมบัญชี");
    expect(await prisma.lineLinkToken.count({ where: { lineUserId: LINE_A } })).toBe(0);
  });

  it("announcements: published items only, with links", async () => {
    const pub = await prisma.announcement.create({
      data: { title: `${PREFIX} ann pub`, authorId, status: "published", publishedAt: FAR_FUTURE },
    });
    await prisma.announcement.create({ data: { title: `${PREFIX} ann draft`, authorId, status: "draft" } });
    const m = await ask("ประกาศ");
    expect(m.text).toContain(`${PREFIX} ann pub`);
    expect(m.text).toContain(`${config.APP_ORIGIN}/announcements/${pub.id}`);
    expect(m.text).not.toContain(`${PREFIX} ann draft`);
  });

  it("says there is no news when none is published (read stubbed to empty)", async () => {
    const spy = vi.spyOn(prisma.newsArticle, "findMany").mockResolvedValueOnce([]);
    const m = await ask("news");
    expect(spy).toHaveBeenCalled();
    expect(m.text).toBe("ยังไม่มีข่าว");
    expect(lastQuickLabels(m)).toHaveLength(5);
  });
});

describe("bot replies, linked user", () => {
  beforeEach(async () => {
    await linkSomchai();
  });

  it("link: says the account is already linked, with no new token", async () => {
    const m = await ask("link");
    expect(m.text).toContain(somchaiName);
    expect(tokenFrom(m.text)).toBeUndefined();
    expect(await prisma.lineLinkToken.count({ where: { lineUserId: LINE_A } })).toBe(0);
    expect(lastQuickLabels(m)).toEqual(["ข่าว", "ประกาศ", "คำถามที่พบบ่อย", "เมนู"]);
  });

  it("unknown text: cannot answer, no link offered", async () => {
    const m = await ask("สวัสดี");
    expect(m.messages).toHaveLength(1);
    expect(m.text).toContain("ยังตอบเรื่องนี้ไม่ได้");
    expect(await prisma.lineLinkToken.count({ where: { lineUserId: LINE_A } })).toBe(0);
    expect(lastQuickLabels(m)).toHaveLength(4);
  });

  it.each(["เมนู", "help", "faq", "คำถาม", "ข่าว", "ประกาศ", "unlink"])("%s answers with quick replies", async (text) => {
    const m = await ask(text);
    expect(lastQuickLabels(m)).toEqual(["ข่าว", "ประกาศ", "คำถามที่พบบ่อย", "เมนู"]);
    expect(m.messages.length).toBeLessThanOrEqual(5);
    for (const message of m.messages) expect(message.text.length).toBeLessThanOrEqual(5000);
  });

  it("a redelivered text message is pushed with a retry key, not replied", async () => {
    const res = await postWebhook(
      app,
      webhookBody([lineEvent({ type: "message", userId: LINE_A, text: "faq", replyToken: "rt-stale", isRedelivery: true })]),
    );
    expect(res.statusCode).toBe(200);
    expect(line.sent).toHaveLength(1);
    expect(line.sent[0]!.kind).toBe("push");
    expect(line.sent[0]!.retryKey).toMatch(UUID);
  });

  it("news with no items says so", async () => {
    vi.spyOn(prisma.newsArticle, "findMany").mockResolvedValueOnce([]);
    const m = await ask("ข่าว");
    expect(m.text).toBe("ยังไม่มีข่าว");
  });
});

describe("bot replies, deactivated linked user", () => {
  it.each(["ข่าว", "เชื่อม", "เมนู"])("%s is answered as for an unlinked user, with no name", async (text) => {
    await linkSomchai();
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "somchai@cedt.edu" }, select: { id: true, isActive: true } });
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    try {
      const m = await ask(text);
      expect(m.text).not.toContain(somchaiName);
      expect(lastQuickLabels(m)).toContain("เชื่อมบัญชี");
      expect(tokenFrom(m.text) !== undefined).toBe(text === "เชื่อม");
    } finally {
      await prisma.user.update({ where: { id: user.id }, data: { isActive: user.isActive } });
    }
  });
});

describe("bot errors", () => {
  it("a failed news read answers 500 without echoing the user ID, name or text", async () => {
    await linkSomchai();
    vi.spyOn(prisma.newsArticle, "findMany").mockRejectedValueOnce(new Error("db down"));
    const text = "ข่าว secret-words";
    const res = await postWebhook(app, webhookBody([lineEvent({ type: "message", userId: LINE_A, text })]));
    expect(res.statusCode).toBe(500);
    for (const secret of [LINE_A, somchaiName, "secret-words"]) expect(res.body).not.toContain(secret);
    expect(line.sent).toHaveLength(0);
  });
});
