import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { csvCell, requestsCsv, nextRequestAction, requestErrorMessage } from "../src/features/course-change/requestTools.ts";

describe("safe request summaries", () => {
  for (const text of ['=HYPERLINK("bad")', ' +SUM(1,2)', '\t=1+1', '\n@SUM(A1)', '-1+2', '\uFEFF=1']) {
    it(`neutralizes formula ${JSON.stringify(text)}`, () => assert.ok(csvCell(text).startsWith('"\'')));
  }
  it("preserves Thai, quotes, commas and multiline reasons", () => {
    assert.equal(csvCell('เหตุผล, "แก้ไข"\nบรรทัดสอง'), '"เหตุผล, ""แก้ไข""\nบรรทัดสอง"');
    assert.equal(csvCell(null), '""');
  });
  it("includes exactly the selected requests, with UTF-8 BOM and the correct status", () => {
    const csv = requestsCsv([{requestNo:'CR-1', requestType:'withdraw', termLabel:'1/2569', courseCode:'2110204',
      courseName:'โครงสร้างดิสครีต', section:null, studentNo:'6630000001', studentName:'นิสิตตัวอย่าง',
      advisorName:null, status:'pending_approval', createdAt:'2026-10-28T03:00:00Z', reason:'=1+1'}]);
    assert.ok(csv.startsWith('\uFEFF'));
    assert.ok(csv.includes('"รอพิจารณา"'));
    assert.ok(csv.includes('"\'=1+1"'));
    assert.equal(csv.split('\r\n').length, 2);
    assert.ok(!csv.includes('CR-2'));
  });
});

describe("request handoffs", () => {
  it("does not treat approval as the registry's final result", () => {
    const next = nextRequestAction('processing','advisor_pi','advisor');
    assert.match(next.description, /ยังไม่ใช่ผลทะเบียนสุดท้าย/);
  });
  it("names the assigned advisor without inventing a turnaround time", () => {
    const next = nextRequestAction('pending_approval','advisor_pi','อาจารย์ตัวอย่าง');
    assert.match(next.description, /อาจารย์ตัวอย่าง/);
    assert.doesNotMatch(next.description, /วัน|ชั่วโมง/);
  });
  it("requires eligibility to be checked again after a rejection", () => {
    assert.match(nextRequestAction('rejected','program_registrar',null).description, /ตรวจช่วงเวลาและสิทธิ์/);
  });
});

describe("action errors", () => {
  it("does not expose server diagnostics in the form", () => {
    assert.doesNotMatch(requestErrorMessage({status:500,message:'SQL connection password=secret'},'fallback'), /SQL|secret|password/);
  });
  it("preserves an actionable deadline message", () => {
    assert.equal(requestErrorMessage({status:422,message:'ปิดรับคำร้องแล้ว'},'fallback'),'ปิดรับคำร้องแล้ว');
  });
  it("explains a network failure in Thai", () => {
    assert.match(requestErrorMessage(new TypeError('Failed to fetch'),'fallback'),/เชื่อมต่อระบบไม่สำเร็จ/);
  });
});


it("renders actionable Thai schedule validation instead of raw schema diagnostics", () => {
  assert.equal(requestErrorMessage({status:422,message:"Validation failed",details:[{field:"",message:"กรุณาระบุงาน Reg Chula หรือ PI ที่นิสิตต้องทำ"}]},"fallback"),"กรุณาระบุงาน Reg Chula หรือ PI ที่นิสิตต้องทำ");
});
