import type { CcRequest, CcStatus } from "../../api/courseChange.ts";

export const STATUS_TEXT: Record<CcStatus, string> = {
  pending_approval: "รอพิจารณา", processing: "อยู่ระหว่างดำเนินการ", completed: "ดำเนินการสำเร็จ",
  rejected: "ไม่อนุมัติ", cancelled: "ยกเลิกแล้ว",
};

/** Keep server diagnostics out of the interaction, while preserving actionable validation. */
export function requestErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof TypeError) return "เชื่อมต่อระบบไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง";
  if (typeof error === "object" && error !== null && "status" in error && typeof error.status === "number") {
    if (error.status >= 500) return "ระบบไม่พร้อมใช้งานชั่วคราว กรุณาลองอีกครั้ง";
    if (error.status === 401) return "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง";
    if (error.status === 403) return "บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้ กรุณาตรวจสอบบัญชีที่เข้าสู่ระบบ";
    if (error.status === 422 && "message" in error && error.message === "Validation failed") {
      const details = "details" in error && Array.isArray(error.details) ? error.details : [];
      const issue = details.find((item: unknown) => typeof item === "object" && item !== null && "message" in item && typeof item.message === "string" && /[\u0E00-\u0E7F]/u.test(item.message));
      return issue?.message ?? "กรุณาตรวจสอบข้อมูลที่กรอกและกรอกช่องที่จำเป็นให้ครบ";
    }
    if ("message" in error && typeof error.message === "string") return error.message;
  }
  return fallback;
}

/** Quotes every field and neutralizes spreadsheet formulas, including leading whitespace. */
export function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[\s\uFEFF]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function requestsCsv(requests: CcRequest[]): string {
  const rows: unknown[][] = [["เลขคำร้อง", "ประเภท", "ภาคการศึกษา", "รหัสวิชา", "ชื่อวิชา", "ตอนเรียน", "รหัสนิสิต", "ชื่อผู้ยื่น", "อาจารย์ที่ปรึกษา", "สถานะ", "วันที่ยื่น", "เหตุผล", "ขั้นตอน", "รอบวิชา", "วันเปิดรับ", "วันปิดรับ"]];
  for (const r of requests) rows.push([r.requestNo, r.requestType === "drop" ? "ลดรายวิชา" : "ถอนรายวิชา", r.termLabel,
    r.courseCode, r.courseName, r.section, r.studentNo, r.studentName, r.advisorName, STATUS_TEXT[r.status], r.createdAt, r.reason, r.phase, r.workflowPlan?.label, r.workflowPlan?.opensOn, r.workflowPlan?.closesOn]);
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function nextRequestAction(status: CcStatus, flow: CcRequest["flow"], advisorName: string | null) {
  switch (status) {
    case "pending_approval": return { title: "รอผู้พิจารณาตรวจสอบคำร้อง", description: flow === "advisor_pi"
      ? `ผู้รับผิดชอบตามเส้นทางปัจจุบัน: ${advisorName ?? "อาจารย์ที่ปรึกษา"} ติดตามผลการพิจารณาได้ที่หน้านี้`
      : "หลักสูตรจะตรวจสอบข้อมูลและบันทึกผลการพิจารณาในระบบ" };
    case "processing": return { title: "รอบันทึกผลขั้นตอนถัดไป", description: "ได้รับการอนุมัติในระบบแล้ว แต่ยังไม่ใช่ผลทะเบียนสุดท้าย ในโหมดสาธิตเจ้าหน้าที่เป็นผู้บันทึกผล" };
    case "rejected": return { title: "อ่านเหตุผลก่อนเตรียมคำร้องใหม่", description: "ตรวจสอบเหตุผลด้านล่าง หากต้องการยื่นใหม่ ระบบจะตรวจช่วงเวลาและสิทธิ์รายวิชาอีกครั้ง" };
    case "cancelled": return { title: "คำร้องนี้หยุดดำเนินการแล้ว", description: "ประวัติยังคงอยู่ หากต้องการยื่นอีกครั้งให้เริ่มคำร้องใหม่และตรวจสอบสิทธิ์ล่าสุด" };
    case "completed": return { title: "เจ้าหน้าที่บันทึกผลสำเร็จแล้ว", description: "ดูรายละเอียดและประวัติการดำเนินการด้านล่าง ข้อมูลในโหมดสาธิตไม่เปลี่ยนผลทะเบียนจริง" };
  }
}
