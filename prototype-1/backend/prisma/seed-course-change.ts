import type { CourseChangeFlow, CourseChangeType } from "@prisma/client";
import { prisma } from "../src/db.js";
import type { SessionUser } from "../src/plugins/auth.js";
import {
  approveRequest,
  completeRequest,
  rejectRequest,
  submitLegacyRequest,
} from "../src/modules/course-change/service.js";
import { CATALOG_SOURCE, CEDT_COURSE_CATALOG } from "./data/cedt-course-catalog.js";

/**
 * Course Change seed (docs/course-change/DATABASE.md §6–7). Every step is idempotent and
 * additive: upserts keyed on natural unique keys, `update: {}` wherever a human may have edited
 * the row since, and no deletes. Requests go through the real service so flows, events,
 * documents and notifications are genuine.
 */

/** Marks seeded enrollment rows — they are synthetic, NOT from Reg Chula. */
export const SYNTHETIC_ENROLLMENT = "synthetic-demo";

// DESIGN.md §3 — the routing matrix for the active term.
const WINDOWS: { requestType: CourseChangeType; weekFrom: number; weekTo: number; flow: CourseChangeFlow }[] = [
  { requestType: "drop", weekFrom: 1, weekTo: 6, flow: "reg_direct" },
  { requestType: "drop", weekFrom: 7, weekTo: 18, flow: "program_registrar" },
  { requestType: "withdraw", weekFrom: 3, weekTo: 6, flow: "reg_direct" },
  { requestType: "withdraw", weekFrom: 7, weekTo: 12, flow: "advisor_pi" },
  { requestType: "withdraw", weekFrom: 13, weekTo: 18, flow: "program_registrar" },
];

/**
 * Upsert the CEDT catalog into the shared `courses` table, keyed on the unique course code.
 * An existing row only gets its provenance marker; its name, instructor and active flag are
 * left alone so manual edits survive re-seeding. Returns code → id.
 */
export async function seedCourseCatalog(): Promise<{
  ids: Record<string, string>;
  created: number;
  existing: number;
}> {
  const ids: Record<string, string> = {};
  let created = 0;
  for (const c of CEDT_COURSE_CATALOG) {
    const before = await prisma.course.findUnique({ where: { code: c.code }, select: { id: true } });
    const row = await prisma.course.upsert({
      where: { code: c.code },
      update: { catalogSource: CATALOG_SOURCE },
      create: { code: c.code, name: c.name, catalogSource: CATALOG_SOURCE },
    });
    if (!before) created++;
    ids[c.code] = row.id;
  }
  return { ids, created, existing: CEDT_COURSE_CATALOG.length - created };
}

// Synthetic demo enrollments: plausible CEDT course mixes for the three test accounts.
// Sections and credits are unknown, so they stay null (never invented).
const STUDENTS = [
  {
    email: "student@cedt.edu", name: "ธนกร ศรีสุข", studentNo: "6630000121", advisor: "anucha",
    courses: ["2110423", "2110426", "2110471", "2110405", "2110413", "2110488"],
  },
  {
    email: "student2@cedt.edu", name: "ณัฐธิดา วงศ์ใหญ่", studentNo: "6630000221", advisor: "pimchanok",
    courses: ["2110322", "2110313", "2110356", "2110403", "5500205"],
  },
  {
    email: "student3@cedt.edu", name: "กิตติพัฒน์ แก้วมณี", studentNo: "6630000321", advisor: "anucha",
    courses: ["2110328", "2110215", "2110252", "2110204", "5500203", "2110582"],
  },
] as const;

export async function seedCourseChange(args: {
  termId: string;
  staff: { admin: SessionUser; anucha: SessionUser; pimchanok: SessionUser };
  hash: (pw: string) => Promise<string>;
}) {
  const { termId, staff } = args;

  // ----------------------------------------------------------------- catalog
  const catalog = await seedCourseCatalog();
  console.log(`Seed: CEDT catalog — ${catalog.created} created, ${catalog.existing} already present.`);

  // ---------------------------------------------------------------- students
  const students: Record<string, SessionUser> = {};
  let enrollmentsCreated = 0;
  for (const s of STUDENTS) {
    const advisorId = staff[s.advisor].id;
    const row = await prisma.user.upsert({
      where: { email: s.email },
      update: { name: s.name, role: "student", studentNo: s.studentNo, advisorId, isActive: true },
      create: {
        email: s.email,
        name: s.name,
        role: "student",
        studentNo: s.studentNo,
        advisorId,
        passwordHash: await args.hash("student1234"),
      },
    });
    students[s.email] = {
      id: row.id, name: row.name, email: row.email, role: row.role,
      titlePrefix: row.titlePrefix, studentNo: row.studentNo,
    };

    for (const code of s.courses) {
      const courseId = catalog.ids[code]!;
      const key = { studentId: row.id, termId, courseId };
      const exists = await prisma.enrollment.findUnique({ where: { studentId_termId_courseId: key } });
      if (exists) continue;
      await prisma.enrollment.create({
        data: { ...key, section: null, credits: null, source: SYNTHETIC_ENROLLMENT },
      });
      enrollmentsCreated++;
    }
  }
  console.log(`Seed: synthetic demo enrollments — ${enrollmentsCreated} created.`);

  // ------------------------------------------------- windows + announcements
  for (const w of WINDOWS) {
    await prisma.courseChangeWindow.upsert({
      where: { termId_requestType_weekFrom: { termId, requestType: w.requestType, weekFrom: w.weekFrom } },
      update: { weekTo: w.weekTo, flow: w.flow },
      create: { termId, ...w },
    });
  }

  // Centralized Announcement: every catalog course, for both types (the per-form split is not
  // in the source data yet). `update: {}` keeps any staff change to an existing row.
  for (const courseId of Object.values(catalog.ids)) {
    await prisma.allowedCourse.upsert({
      where: { termId_courseId: { termId, courseId } },
      update: {},
      create: { termId, courseId, allowDrop: true, allowWithdraw: true },
    });
  }

  // --------------------------------------------------------- sample requests
  const s1 = students["student@cedt.edu"]!;
  const s2 = students["student2@cedt.edu"]!;
  const s3 = students["student3@cedt.edu"]!;

  /**
   * Submit "on" a past date, then backdate the row so its timestamps match its week. Skipped
   * when the student already has any request for that course this term (idempotent).
   */
  const submitOn = async (
    date: string,
    me: SessionUser,
    requestType: CourseChangeType,
    code: string,
    reason: string,
  ) => {
    const courseId = catalog.ids[code]!;
    const prior = await prisma.courseChangeRequest.findFirst({
      where: { studentId: me.id, courseId, termId },
    });
    if (prior) return null;

    const r = await submitLegacyRequest({ requestType, courseId, reason }, me, date);
    const at = new Date(`${date}T10:15:00+07:00`);
    await prisma.courseChangeRequest.update({ where: { id: r.id }, data: { createdAt: at } });
    await prisma.courseChangeEvent.updateMany({ where: { requestId: r.id }, data: { createdAt: at } });
    return r;
  };

  // Flow A (week 4) — went straight to Reg Chula, registry confirmed.
  const a = await submitOn("2026-08-27", s1, "drop", "2110405", "ลงทะเบียนเกินหน่วยกิตที่วางแผนไว้ ต้องการลดภาระเพื่อโฟกัสวิชาแกน");
  if (a) await completeRequest(a.id, "Reg Chula ยืนยันการลดรายวิชาแล้ว", staff.admin);

  // Flow B (week 9) — waiting for the advisor (Dr. Anucha).
  await submitOn("2026-09-28", s1, "withdraw", "2110471", "ป่วยต่อเนื่อง 3 สัปดาห์ (มีใบรับรองแพทย์) ตามเนื้อหาไม่ทัน");

  // Flow B (week 8) — advisor approved: document generated, sent to Reg Chula + PI.
  const b = await submitOn("2026-09-21", s2, "withdraw", "2110322", "ต้องการถอนเพื่อลงเรียนใหม่ในภาคการศึกษาหน้าพร้อมกลุ่มเรียน");
  if (b) await approveRequest(b.id, staff.pimchanok);

  // Flow C (week 8) — waiting for the programme.
  await submitOn("2026-09-22", s2, "drop", "2110313", "ตารางเรียนชนกับรายวิชาบังคับที่เพิ่งเปิดเพิ่ม");

  // Flow B (week 9) — waiting for the advisor.
  await submitOn("2026-09-29", s3, "withdraw", "2110328", "ภาระงานสหกิจศึกษาชนกับเวลาเรียน ไม่สามารถส่งงานที่เหลือได้ตามกำหนด");

  // Flow C (week 7) — rejected, with the reason the student sees.
  const c = await submitOn("2026-09-15", s3, "drop", "2110215", "เรียนไม่ทัน");
  if (c) await rejectRequest(c.id, "กรุณาปรึกษาอาจารย์ผู้สอนก่อน และยื่นใหม่พร้อมเหตุผลที่ชัดเจนขึ้น", staff.admin);

  const counts = await prisma.courseChangeRequest.groupBy({ by: ["status"], _count: true });
  console.log("Seed: course-change requests", counts.map((x) => `${x.status}=${x._count}`).join(" "));
  console.log("Login (student): student@cedt.edu / student1234");
}
