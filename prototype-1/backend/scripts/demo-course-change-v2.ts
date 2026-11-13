import { createDemoScenarios } from "./demo-course-change-scenarios.js";
import { ccToday } from "../src/modules/course-change/service.js";
import { prisma } from "../src/db.js";
import { isoDate, addDaysISO } from "../src/lib/time.js";
import { saveSchedule } from "../src/modules/course-change/workflow.js";

// Additive, isolated demo course. Never changes real course dates or resets requests.
try {
  const term = await prisma.term.findFirstOrThrow({
    where: { isActive: true },
  });
  const today = ccToday();
  // Submission dates must lie inside the active term (the same rule staff are held to), so the
  // demo can only open a window when today is inside it. It never moves or extends the term.
  if (today < isoDate(term.startDate) || today > isoDate(term.endDate))
    throw new Error(
      `Today (${today}) is outside the active term ${isoDate(term.startDate)} – ${isoDate(term.endDate)}, ` +
        "so no valid submission dates exist. Activate a term that contains today " +
        "(Master Data → Terms), or set COURSE_CHANGE_TODAY in backend/.env to a date inside the term " +
        "for a simulated demo. Nothing was changed.",
    );
  // Open from today for a week, clipped to the last day of the term.
  const closesOn = [addDaysISO(today, 7), isoDate(term.endDate)].sort()[0]!;
  const staff = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@cedt.edu" },
  });
  const student = await prisma.user.findUniqueOrThrow({
    where: { email: "student3@cedt.edu" },
  });
  const code = "DEMO-CC-V2";
  const previous = await prisma.course.findUnique({ where: { code } });
  if (previous && previous.catalogSource !== "synthetic-course-change-v2")
    throw new Error(
      "Reserved demo code belongs to another source; nothing changed.",
    );
  const course = await prisma.course.upsert({
    where: { code },
    update: {},
    create: {
      code,
      name: "รายวิชาสาธิต ลด/ถอนรุ่นใหม่ — ไม่ใช่รายวิชาจริง",
      catalogSource: "synthetic-course-change-v2",
    },
  });
  await prisma.enrollment.upsert({
    where: {
      studentId_termId_courseId: {
        studentId: student.id,
        termId: term.id,
        courseId: course.id,
      },
    },
    update: {},
    create: {
      studentId: student.id,
      termId: term.id,
      courseId: course.id,
      section: "DEMO",
      source: "synthetic-demo",
    },
  });
  await prisma.allowedCourse.upsert({
    where: { termId_courseId: { termId: term.id, courseId: course.id } },
    update: {},
    create: {
      termId: term.id,
      courseId: course.id,
      note: "สำหรับทดลองระบบเท่านั้น ไม่ใช่กำหนดการหรือวิชาของมหาวิทยาลัย",
      allowDrop: true,
      allowWithdraw: true,
    },
  });
  for (const requestType of ["drop", "withdraw"] as const) {
    // DEMO-CC-V2 is synthetic (guarded above), so a stale window from an earlier run may be
    // moved to today. A schedule that is published and still covers today is left as it is.
    const existing = await prisma.courseChangeSchedule.findFirst({
      where: { termId: term.id, courseId: course.id, requestType },
    });
    if (
      existing?.published &&
      isoDate(existing.opensOn) <= today &&
      isoDate(existing.closesOn) >= today
    )
      continue;
    await saveSchedule(
      {
        ...(existing ? { id: existing.id, revision: existing.revision } : {}),
        termId: term.id,
        courseId: course.id,
        section: "DEMO",
        requestType,
        label: `สาธิตเท่านั้น — ${requestType === "drop" ? "ลดผ่าน Reg" : "ถอน ลงนาม รวมไฟล์ และ PI"}`,
        format: "block",
        opensOn: today,
        closesOn,
        finalOn: null,
        flow: requestType === "drop" ? "reg_direct" : "advisor_pi",
        needsSignature: requestType === "withdraw",
        needsReg: true,
        needsPi: requestType === "withdraw",
        needsMerge: requestType === "withdraw",
        published: true,
        reason:
          "เพิ่มข้อมูลสาธิตแยกต่างหาก ไม่ใช่กฎมหาวิทยาลัยและไม่แก้ข้อมูลเดิม",
      },
      staff,
    );
  }
  await createDemoScenarios(term, today, staff, student);
  console.log(
    `Ready: student3@cedt.edu → DEMO-CC-V2, open ${today} – ${closesOn}. ` +
      "No existing requests or programme schedules were reset.",
  );
} finally {
  await prisma.$disconnect();
}
