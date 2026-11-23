import crypto from "node:crypto";
import type { CourseChangeType } from "@prisma/client";

/**
 * Document Generator & Merger (DESIGN.md §2.1, CC-BR-7). Builds the two petition forms the
 * student used to print, sign and merge by hand — the university form (ฉบับพระเกี้ยว) and the
 * faculty form (ฉบับเกียร์) — as ONE document, sealed with a SHA-256 over its content.
 *
 * Prototype scope: printable HTML + content hash. Real PDF output and a PAdES signature are
 * on the roadmap; the hash already proves the approved content was not altered afterwards.
 */

export interface DocumentContent {
  requestNo: string;
  requestType: CourseChangeType;
  termLabel: string;
  weekNo: number;
  studentName: string;
  studentNo: string;
  courseCode: string;
  courseName: string;
  section: string | null;
  credits: number | null;
  reason: string;
  submittedAt: string;
  approverName: string;
  approvedAt: string;
}

/** Canonical JSON (sorted keys) so the hash is stable across runs. */
export function documentHash(c: DocumentContent): string {
  const canonical = JSON.stringify(
    Object.fromEntries(Object.entries(c).sort(([a], [b]) => a.localeCompare(b))),
  );
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

const esc = (s: string | number): string =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const thaiDateTime = (iso: string): string =>
  new Intl.DateTimeFormat("th-TH", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(iso));

const TYPE_TH: Record<CourseChangeType, string> = { drop: "ลดรายวิชา", withdraw: "ถอนรายวิชา (W)" };

function form(title: string, subtitle: string, c: DocumentContent, hash: string): string {
  return `
  <section class="page">
    <header>
      <div class="seal">${esc(subtitle)}</div>
      <h1>${esc(title)}</h1>
      <p class="muted">เลขที่คำร้อง ${esc(c.requestNo)} · ${esc(c.termLabel)} · ยื่นในสัปดาห์ที่ ${esc(c.weekNo)}</p>
    </header>
    <table>
      <tr><th>ประเภทคำร้อง</th><td>${esc(TYPE_TH[c.requestType])}</td></tr>
      <tr><th>ชื่อ-นามสกุล</th><td>${esc(c.studentName)}</td></tr>
      <tr><th>รหัสประจำตัวนิสิต</th><td>${esc(c.studentNo)}</td></tr>
      <tr><th>รายวิชา</th><td>${esc(c.courseCode)} ${esc(c.courseName)}</td></tr>
      <tr><th>ตอนเรียน / หน่วยกิต</th><td>${esc(c.section ?? "—")} / ${esc(c.credits ?? "—")}</td></tr>
      <tr><th>เหตุผล</th><td class="pre">${esc(c.reason)}</td></tr>
    </table>
    <div class="sign">
      <div>
        <p class="label">ผู้ยื่นคำร้อง (ยืนยันตัวตนผ่านระบบ)</p>
        <p class="name">${esc(c.studentName)}</p>
        <p class="muted">${esc(thaiDateTime(c.submittedAt))}</p>
      </div>
      <div>
        <p class="label">ผู้อนุมัติ (ยืนยันผ่านบัญชีในระบบสาธิต)</p>
        <p class="name">${esc(c.approverName)}</p>
        <p class="muted">${esc(thaiDateTime(c.approvedAt))}</p>
      </div>
    </div>
    <footer>เอกสาร HTML สาธิต — ยังไม่ใช่ PDF ที่ลงนามดิจิทัล<br>SHA-256 ${esc(hash)}</footer>
  </section>`;
}

export function renderDocumentHtml(
  c: DocumentContent,
  storedHash: string,
): string {
  const actual = documentHash(c);
  const intact = actual === storedHash;

  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8">
<title>${esc(c.requestNo)} — คำร้อง${esc(TYPE_TH[c.requestType])}</title>
<style>
  body { font-family: "Sarabun", "Noto Sans Thai", system-ui, sans-serif; color: #0a0a0a; margin: 0; background: #f5f5f5; }
  .bar { position: sticky; top: 0; display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 12px 24px; background: #fff; border-bottom: 1px solid #e5e5e5; font-size: 14px; }
  .bar b { font-weight: 600; }
  .verify { padding: 4px 10px; border-radius: 6px; border: 1px solid #0a0a0a; font-size: 12px; }
  .verify.bad { border-width: 2px; }
  .page { width: min(794px, calc(100% - 24px)); min-height: 1000px; box-sizing: border-box; margin: 24px auto; padding: 56px 64px; background: #fff; border: 1px solid #e5e5e5; display: flex; flex-direction: column; gap: 28px; }
  header { text-align: center; }
  .seal { display: inline-block; padding: 4px 12px; border: 1px solid #0a0a0a; border-radius: 999px; font-size: 12px; letter-spacing: .04em; }
  h1 { font-size: 22px; margin: 16px 0 6px; }
  .muted { color: #737373; font-size: 13px; margin: 0; }
  table { width: 100%; border-collapse: collapse; font-size: 15px; }
  th { width: 34%; text-align: left; font-weight: 500; color: #525252; }
  th, td { padding: 10px 0; border-bottom: 1px solid #e5e5e5; vertical-align: top; }
  .pre { white-space: pre-wrap; overflow-wrap: anywhere; }
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: auto; }
  .sign > div { border-top: 1px dashed #0a0a0a; padding-top: 12px; }
  .label { font-size: 12px; color: #737373; margin: 0 0 4px; }
  .name { font-size: 16px; font-weight: 600; margin: 0 0 2px; }
  footer { font-family: ui-monospace, monospace; font-size: 11px; color: #737373; word-break: break-all; }
  @media print { body { background: #fff; } .bar { display: none; } .page { width: 794px; margin: 0; border: 0; page-break-after: always; } }
</style></head>
<body>
  <div class="bar">
    <span><b>${esc(c.requestNo)}</b> · เอกสารคำร้องรวม 2 ฉบับ (สร้างอัตโนมัติ)</span>
    <span class="verify${intact ? "" : " bad"}">${
      intact ? "ตรวจสอบแล้ว: เนื้อหาตรงกับที่อนุมัติ" : "คำเตือน: เนื้อหาไม่ตรงกับ hash ที่อนุมัติ"
    }</span>
  </div>
  ${form(`คำร้องขอ${TYPE_TH[c.requestType]}`, "ฉบับพระเกี้ยว · จุฬาลงกรณ์มหาวิทยาลัย", c, storedHash)}
  ${form(`คำร้องขอ${TYPE_TH[c.requestType]} (สำหรับคณะ)`, "ฉบับเกียร์ · คณะวิศวกรรมศาสตร์", c, storedHash)}
</body></html>`;
}
