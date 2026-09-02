import argon2 from "argon2";
import { prisma } from "../src/db.js";
import type { SessionUser } from "../src/plugins/auth.js";
import { approveBooking, createBooking, rejectBooking } from "../src/modules/bookings/service.js";
import type { BookingInput } from "../src/modules/bookings/schemas.js";
import { dateFromISO } from "../src/lib/time.js";

/**
 * Seeds the dataset the wireframes were designed against (§9). Idempotent: every write is
 * an upsert keyed on a unique column, and bookings are only created on a clean booking table.
 */

const hash = (pw: string) => argon2.hash(pw, { type: argon2.argon2id });

async function main() {
  // ------------------------------------------------------------------- users
  const users = [
    { name: "Waraporn K.", titlePrefix: null, email: "admin@cedt.edu", password: "admin1234", role: "staff" as const },
    { name: "Somchai P.", titlePrefix: "Dr.", email: "somchai@cedt.edu", password: "instr1234", role: "staff" as const },
    { name: "Anucha T.", titlePrefix: "Dr.", email: "anucha@cedt.edu", password: "instr1234", role: "staff" as const },
    { name: "Pimchanok R.", titlePrefix: "Asst. Prof.", email: "pimchanok@cedt.edu", password: "instr1234", role: "staff" as const },
    { name: "Krit W.", titlePrefix: "Dr.", email: "krit@cedt.edu", password: "instr1234", role: "staff" as const },
  ];

  const userByEmail: Record<string, { id: string; name: string; email: string; role: "staff"; titlePrefix: string | null }> = {};
  for (const u of users) {
    const row = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, titlePrefix: u.titlePrefix, role: u.role, isActive: true },
      create: {
        name: u.name,
        titlePrefix: u.titlePrefix,
        email: u.email,
        role: u.role,
        passwordHash: await hash(u.password),
      },
    });
    userByEmail[u.email] = {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      titlePrefix: row.titlePrefix,
    };
  }

  const admin = userByEmail["admin@cedt.edu"]! as SessionUser;
  const somchai = userByEmail["somchai@cedt.edu"]! as SessionUser;
  const anucha = userByEmail["anucha@cedt.edu"]! as SessionUser;
  const pimchanok = userByEmail["pimchanok@cedt.edu"]! as SessionUser;
  const krit = userByEmail["krit@cedt.edu"]! as SessionUser;

  // ------------------------------------------------------------------- terms
  // The active term must be flipped off before upserting a new active one (one_active_term).
  await prisma.term.updateMany({ where: { isActive: true }, data: { isActive: false } });

  const term1 = await prisma.term.upsert({
    where: { academicYear_termNumber: { academicYear: 2026, termNumber: 1 } },
    update: {
      startDate: dateFromISO("2026-08-03"),
      endDate: dateFromISO("2026-11-27"),
      isActive: true,
    },
    create: {
      academicYear: 2026,
      termNumber: 1,
      startDate: dateFromISO("2026-08-03"),
      endDate: dateFromISO("2026-11-27"),
      isActive: true,
    },
  });

  await prisma.term.upsert({
    where: { academicYear_termNumber: { academicYear: 2025, termNumber: 2 } },
    update: { isActive: false },
    create: {
      academicYear: 2025,
      termNumber: 2,
      startDate: dateFromISO("2026-01-05"),
      endDate: dateFromISO("2026-05-01"),
      isActive: false,
    },
  });

  // -------------------------------------------------------- building & rooms
  const e12 = await prisma.building.upsert({
    where: { code: "E12" },
    update: { name: "Engineering Building 12" },
    create: { code: "E12", name: "Engineering Building 12" },
  });

  const roomSpecs = [
    { name: "E12-301", capacity: 40, roomType: "lecture" as const, equipment: ["projector"] },
    { name: "E12-302", capacity: 40, roomType: "lecture" as const, equipment: ["projector"] },
    { name: "E12-410", capacity: 60, roomType: "lecture" as const, equipment: ["projector", "audio system"] },
    { name: "E12-Lab1", capacity: 30, roomType: "lab" as const, equipment: ["workstations", "projector"] },
    { name: "E12-Lab2", capacity: 30, roomType: "lab" as const, equipment: ["workstations"] },
    { name: "E12-HW1", capacity: 24, roomType: "hardware" as const, equipment: ["oscilloscopes", "soldering stations"] },
    { name: "E12-501", capacity: 12, roomType: "meeting" as const, equipment: ["TV screen"] },
  ];

  const roomByName: Record<string, string> = {};
  for (const r of roomSpecs) {
    const row = await prisma.room.upsert({
      where: { buildingId_name: { buildingId: e12.id, name: r.name } },
      update: { capacity: r.capacity, roomType: r.roomType, equipment: r.equipment, isActive: true },
      create: { buildingId: e12.id, ...r },
    });
    roomByName[r.name] = row.id;
  }

  // ----------------------------------------------------------------- courses
  const courseSpecs = [
    { code: "CEDT101", name: "Intro to Computer Engineering", instructor: somchai.id },
    { code: "CEDT205", name: "Digital Systems Lab", instructor: anucha.id },
    { code: "CEDT210", name: "Data Structures & Algorithms", instructor: pimchanok.id },
    { code: "CEDT330", name: "Embedded Systems", instructor: krit.id },
    { code: "CEDT415", name: "Machine Learning Systems", instructor: somchai.id },
    { code: "CEDT499", name: "Senior Project", instructor: null },
  ];

  const courseByCode: Record<string, string> = {};
  for (const c of courseSpecs) {
    const row = await prisma.course.upsert({
      where: { code: c.code },
      update: { name: c.name, defaultInstructorId: c.instructor, isActive: true },
      create: { code: c.code, name: c.name, defaultInstructorId: c.instructor },
    });
    courseByCode[c.code] = row.id;
  }

  // ---------------------------------------------------------------- bookings
  // Bookings go through the real service so occurrences, snapshots, request numbers and
  // notifications are all produced exactly as they are at runtime.
  const existing = await prisma.booking.count();
  if (existing > 0) {
    console.log(`Seed: master data upserted; ${existing} bookings already present — skipping booking seed.`);
    return;
  }

  const TERM = term1.id;
  const recurring = (over: Partial<BookingInput>): BookingInput =>
    ({
      bookingType: "recurring",
      termId: TERM,
      startDate: "2026-08-03",
      endDate: "2026-11-27",
      oneOffDate: null,
      section: "1",
      note: null,
      ...over,
    }) as BookingInput;

  // Approved (created by the instructor, then approved by the admin — so decidedBy/decidedAt
  // are set and the occurrences become blocking).
  const approvedSpecs: { input: BookingInput; requester: SessionUser }[] = [
    {
      requester: somchai,
      input: recurring({
        courseId: courseByCode["CEDT101"], instructorId: somchai.id, roomId: roomByName["E12-301"],
        dayOfWeek: 1, startTime: "10:00", endTime: "12:00", studentCount: 38, section: "1",
      }),
    },
    {
      requester: anucha,
      input: recurring({
        courseId: courseByCode["CEDT205"], instructorId: anucha.id, roomId: roomByName["E12-Lab1"],
        dayOfWeek: 2, startTime: "13:00", endTime: "16:00", studentCount: 28, section: "1",
      }),
    },
    {
      requester: pimchanok,
      input: recurring({
        courseId: courseByCode["CEDT210"], instructorId: pimchanok.id, roomId: roomByName["E12-410"],
        dayOfWeek: 3, startTime: "09:00", endTime: "11:00", studentCount: 55, section: "2",
      }),
    },
    {
      requester: krit,
      input: recurring({
        courseId: courseByCode["CEDT330"], instructorId: krit.id, roomId: roomByName["E12-HW1"],
        dayOfWeek: 4, startTime: "13:00", endTime: "16:00", studentCount: 22, section: "1",
      }),
    },
    {
      requester: somchai,
      input: recurring({
        courseId: courseByCode["CEDT415"], instructorId: somchai.id, roomId: roomByName["E12-302"],
        dayOfWeek: 5, startTime: "10:00", endTime: "12:00", studentCount: 30, section: "1",
      }),
    },
  ];

  // Pending — these fill the admin's queue.
  const pendingSpecs: { input: BookingInput; requester: SessionUser }[] = [
    {
      requester: somchai,
      input: recurring({
        courseId: courseByCode["CEDT499"], instructorId: somchai.id, roomId: roomByName["E12-501"],
        dayOfWeek: 1, startTime: "13:00", endTime: "15:00", studentCount: 10, section: "1",
        note: "Senior project advising",
      }),
    },
    {
      requester: anucha,
      input: recurring({
        courseId: courseByCode["CEDT205"], instructorId: anucha.id, roomId: roomByName["E12-Lab2"],
        dayOfWeek: 2, startTime: "13:00", endTime: "16:00", studentCount: 26, section: "2",
      }),
    },
    {
      requester: pimchanok,
      input: {
        bookingType: "one_off",
        termId: TERM,
        courseId: courseByCode["CEDT210"],
        instructorId: pimchanok.id,
        roomId: roomByName["E12-410"]!,
        oneOffDate: "2026-08-19",
        startTime: "13:00",
        endTime: "15:00",
        studentCount: 55,
        section: "1",
        note: "Makeup class",
      } as BookingInput,
    },
    {
      // Deliberately overlaps the APPROVED CEDT101 booking (BR-8): approving it must 409.
      requester: krit,
      input: recurring({
        courseId: courseByCode["CEDT101"], instructorId: somchai.id, roomId: roomByName["E12-301"],
        dayOfWeek: 1, startTime: "10:00", endTime: "12:00", studentCount: 35, section: "2",
      }),
    },
  ];

  // Order matters. Submitting a request that overlaps an APPROVED booking is refused at
  // submit time (BR-6), so every booking is created first — while nothing is approved and
  // pending-vs-pending overlap is legal (BR-3) — and only then are the five approved.
  // That leaves Krit's CEDT101 Sec 2 pending on top of an approved slot, which is exactly
  // the BR-8 demo: its Approve button must fail with 409 CONFLICT.
  // Every booking is created PENDING (autoApprove: false) so nothing blocks yet, then the
  // five are approved — leaving Krit's CEDT101 Sec 2 pending on top of an approved slot (BR-8).
  const toApprove: string[] = [];
  for (const s of approvedSpecs) {
    const b = await createBooking(s.input, s.requester, { autoApprove: false });
    toApprove.push(b.id);
  }
  for (const s of pendingSpecs) {
    await createBooking(s.input, s.requester, { autoApprove: false });
  }
  for (const id of toApprove) {
    await approveBooking(id, admin);
  }

  // Rejected — so My Requests shows the rejected state with the admin's reason.
  const rejected = await createBooking(
    recurring({
      courseId: courseByCode["CEDT330"], instructorId: krit.id, roomId: roomByName["E12-HW1"],
      dayOfWeek: 3, startTime: "09:00", endTime: "12:00", studentCount: 20, section: "2",
    }),
    krit,
    { autoApprove: false },
  );
  await rejectBooking(rejected.id, "Room reserved for maintenance during that window.", admin);

  const counts = await prisma.booking.groupBy({ by: ["status"], _count: true });
  console.log("Seed complete:", counts.map((c) => `${c.status}=${c._count}`).join(" "));
  console.log("Login: admin@cedt.edu / admin1234  |  somchai@cedt.edu / instr1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
