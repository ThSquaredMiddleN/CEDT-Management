import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { Term } from "@prisma/client";
import { prisma } from "../src/db.js";
import { isoDate, addDaysISO } from "../src/lib/time.js";
import type { SessionUser } from "../src/plugins/auth.js";
import {
  action,
  saveSchedule,
  submitRequest,
  uploadFile,
} from "../src/modules/course-change/workflow.js";
async function demoPdf(label: string) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText("DEMO ONLY - NOT AN OFFICIAL PETITION", {
    x: 40,
    y: 760,
    size: 16,
    font,
  });
  page.drawText(label, { x: 40, y: 720, size: 12, font });
  page.drawText(
    "Synthetic test fixture. No real signature or student information.",
    { x: 40, y: 690, size: 10, font },
  );
  return Buffer.from(await pdf.save());
}
/** Each invocation adds a fresh, clearly marked series; never reset another demo run. */
export async function createDemoScenarios(
  term: Term,
  today: string,
  staff: SessionUser,
  student: SessionUser,
) {
  const run = randomUUID().slice(0, 6).toUpperCase();
  const other = await prisma.user.findUniqueOrThrow({
    where: { email: "student2@cedt.edu" },
  });
  const original = await demoPdf("Programme petition test document");
  const reg = await demoPdf("Reg Chula test document");
  const directory = new URL(
    `../../artifacts/course-change-04-11/${run}/`,
    import.meta.url,
  );
  await mkdir(directory, { recursive: true });
  await writeFile(new URL("DEMO-programme.pdf", directory), original, {
    flag: "wx",
  });
  await writeFile(new URL("DEMO-reg.pdf", directory), reg, { flag: "wx" });
  for (const kind of ["DROP", "SIGN", "REGISTRAR", "EDIT"] as const) {
    const code = `DEMO-${kind}-${run}`;
    const course = await prisma.course.create({
      data: {
        code,
        name: `สาธิต ${kind} รอบ ${run} — ไม่ใช่รายวิชาจริง`,
        catalogSource: "synthetic-course-change-v2",
      },
    });
    await prisma.allowedCourse.create({
      data: {
        termId: term.id,
        courseId: course.id,
        note: "ข้อมูลสาธิตเท่านั้น ไม่ใช่กฎมหาวิทยาลัย",
      },
    });
    const students = kind === "SIGN" ? [student, other] : [student];
    for (const owner of students)
      await prisma.enrollment.create({
        data: {
          studentId: owner.id,
          termId: term.id,
          courseId: course.id,
          section: "DEMO",
          source: "synthetic-demo",
        },
      });
    await saveSchedule(
      {
        termId: term.id,
        courseId: course.id,
        section: "DEMO",
        requestType: kind === "DROP" ? "drop" : "withdraw",
        label: `สาธิต ${kind} รอบ ${run}`,
        format: kind === "DROP" ? "full_term" : "block",
        opensOn: today,
        closesOn: [addDaysISO(today, 7), isoDate(term.endDate)].sort()[0]!,
        finalOn: null,
        flow:
          kind === "DROP"
            ? "reg_direct"
            : kind === "REGISTRAR"
              ? "program_registrar"
              : "advisor_pi",
        needsSignature: kind !== "DROP",
        needsReg: kind !== "REGISTRAR",
        needsPi: kind !== "DROP" && kind !== "REGISTRAR",
        needsMerge: kind !== "DROP" && kind !== "REGISTRAR",
        published: true,
        reason: "สร้างกรณีสาธิตใหม่แยกจากข้อมูลเดิม",
      },
      staff,
    );
    if (kind === "DROP") {
      console.log(`${code}: ready for new student submission`);
      continue;
    }
    for (const owner of students) {
      let r = await submitRequest(
        {
          clientRequestId: randomUUID(),
          courseId: course.id,
          requestType: "withdraw",
          reason: `ทดลอง ${kind} เท่านั้น ไม่ใช่คำร้องทะเบียนจริง`,
        },
        owner,
        today,
      );
      if (kind === "EDIT")
        r = await action(
          r.id,
          {
            revision: r.revision,
            action: "request_revision",
            note: "ตัวอย่างสาธิต: โปรดเพิ่มรายละเอียดเหตุผลก่อนส่งกลับ",
          },
          staff,
        );
      else
        r = await action(
          r.id,
          {
            revision: r.revision,
            action: "review",
            note: "ตรวจข้อมูลสาธิตแล้ว",
          },
          staff,
        );
      if (kind === "REGISTRAR") {
        r = await uploadFile(
          r.id,
          r.revision,
          "signed_petition",
          "DEMO-NO-REAL-SIGNATURE.pdf",
          original,
          staff,
        );
        r = await action(
          r.id,
          {
            revision: r.revision,
            action: "return_signed",
            note: "เอกสารทดสอบ ไม่มีลายเซ็นจริง ใช้สาธิตขั้นส่ง สนท. เท่านั้น",
          },
          staff,
        );
      }
      console.log(`${code}: ${r.requestNo} / ${r.phase} / ${owner.email}`);
    }
  }
  console.log(`DEMO PDFs (no real data): ${fileURLToPath(directory)}`);
}
