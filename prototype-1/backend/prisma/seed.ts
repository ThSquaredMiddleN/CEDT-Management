import { deflateSync } from "node:zlib";
import argon2 from "argon2";
import { loadSessionUser } from "../src/core/permissions.js";
import { prisma } from "../src/db.js";
import type { SessionUser } from "../src/plugins/auth.js";
import { approveBooking, createBooking, rejectBooking } from "../src/modules/bookings/service.js";
import type { BookingInput } from "../src/modules/bookings/schemas.js";
import { addNewsImages } from "../src/modules/news/service.js";
import { dateFromISO } from "../src/lib/time.js";
import { seedCourseChange } from "./seed-course-change.js";
import { assignRole, seedTestAccounts } from "./seed-test-accounts.js";

/**
 * Seeds the dataset the wireframes were designed against (§9). Idempotent: every write is
 * an upsert keyed on a unique column, and bookings are only created on a clean booking table.
 */

const hash = (pw: string) => argon2.hash(pw, { type: argon2.argon2id });

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function createPlaceholderPng(
  width: number,
  height: number,
  rgb: readonly [number, number, number],
): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowSize = 1 + width * 3;
  const raw = Buffer.alloc(rowSize * height);
  const [r, g, b] = rgb;
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowSize;
    raw[rowStart] = 0;
    for (let x = 0; x < width; x++) {
      const px = rowStart + 1 + x * 3;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function main() {
  // ------------------------------------------------------------------- users
  const users = [
    { name: "Waraporn K.", titlePrefix: null, email: "admin@cedt.edu", password: "admin1234" },
    { name: "Somchai P.", titlePrefix: "Dr.", email: "somchai@cedt.edu", password: "instr1234" },
    { name: "Anucha T.", titlePrefix: "Dr.", email: "anucha@cedt.edu", password: "instr1234" },
    { name: "Pimchanok R.", titlePrefix: "Asst. Prof.", email: "pimchanok@cedt.edu", password: "instr1234" },
    { name: "Krit W.", titlePrefix: "Dr.", email: "krit@cedt.edu", password: "instr1234" },
  ];

  const userRows: Record<string, { id: string }> = {};
  const userByEmail: Record<string, SessionUser> = {};
  for (const u of users) {
    const row = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, titlePrefix: u.titlePrefix, isActive: true },
      create: {
        name: u.name,
        titlePrefix: u.titlePrefix,
        email: u.email,
        passwordHash: await hash(u.password),
      },
    });
    userRows[u.email] = { id: row.id };
  }

  // Roles (step 5a): the demo admin is staff + IT admin; instructors keep the legacy staff role.
  for (const u of users) await assignRole(prisma, userRows[u.email]!.id, "staff");
  await assignRole(prisma, userRows["admin@cedt.edu"]!.id, "it_admin");
  await seedTestAccounts(prisma, hash);
  for (const u of users) {
    const r = userRows[u.email]!;
    userByEmail[u.email] = (await loadSessionUser(r.id))!;
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

  // ----------------------------------------------------------- announcements
  const publishedAnnouncementCount = await prisma.announcement.count({
    where: { status: "published" },
  });
  if (publishedAnnouncementCount === 0) {
    await prisma.announcement.createMany({
      data: [
        {
          title: "ประกาศที่นั่งสอบกลางภาควิชา 2110575",
          content:
            "<p>นิสิตชั้นปีที่ 3 ที่ลงทะเบียนรายวิชา <strong>2110575</strong> สามารถตรวจสอบผังที่นั่งสอบกลางภาคและข้อปฏิบัติการเข้าห้องสอบได้ที่อาคาร <strong>E12</strong></p><ul><li>กรุณานำบัตรนิสิตมาแสดงก่อนเข้าห้องสอบ 15 นาที</li><li>ไม่อนุญาตให้นำอุปกรณ์สื่อสารเข้าห้องสอบ</li></ul>",
          audiences: ["year3"],
          status: "published",
          authorId: admin.id,
          publishedAt: new Date("2026-10-01T09:00:00+07:00"),
        },
        {
          title: "กำหนดการลงทะเบียนเรียนและเพิ่ม-ลดรายวิชา ภาคต้น 2569",
          content:
            "<p>แจ้งกำหนดการเพิ่ม-ลดรายวิชาสำหรับนิสิตหลักสูตร CEDT ทุกชั้นปี ประจำภาคการศึกษาต้น ปีการศึกษา 2569</p><ul><li>ช่วงเพิ่ม-ลดรายวิชา: 3 – 14 สิงหาคม 2569</li><li>ตรวจสอบตารางเรียนและห้องปฏิบัติการได้ที่หน้า ตารางเรียน / สอบ</li></ul>",
          audiences: ["all"],
          status: "published",
          authorId: admin.id,
          publishedAt: new Date("2026-09-25T10:00:00+07:00"),
        },
        {
          title: "เปิดรับยื่นแบบฟอร์มขอฝึกงานภาคฤดูร้อน 2569",
          content:
            "<p>นิสิตที่ประสงค์ฝึกงานในภาคฤดูร้อน 2569 ให้ยื่นแบบฟอร์มขอหนังสือส่งตัวและแจ้งข้อมูลสถานประกอบการผ่านระบบภายในวันที่ <strong>30 พฤศจิกายน 2569</strong></p>",
          audiences: ["year2", "year3"],
          status: "published",
          authorId: admin.id,
          publishedAt: new Date("2026-09-18T14:00:00+07:00"),
        },
        {
          title: "ปฐมนิเทศนิสิตใหม่ CEDT ประจำปีการศึกษา 2569",
          content:
            "<p>ขอเชิญนิสิตชั้นปีที่ 1 เข้าร่วมกิจกรรมปฐมนิเทศและแนะนำการใช้ห้องปฏิบัติการคอมพิวเตอร์ ณ ห้อง <strong>E12-410</strong> เวลา 09:00 – 12:00 น.</p>",
          audiences: ["year1"],
          status: "published",
          authorId: admin.id,
          publishedAt: new Date("2026-09-10T08:30:00+07:00"),
        },
        {
          title: "กำหนดส่งเล่มโครงงาน Senior Project (CEDT499)",
          content:
            "<p>นิสิตชั้นปีที่ 4 ที่ลงทะเบียนรายวิชา <strong>CEDT499 Senior Project</strong> กรุณาส่งเอกสารสรุปความก้าวหน้าและจองเวลาพบอาจารย์ที่ปรึกษาก่อนวันสอบโครงงาน</p>",
          audiences: ["year4"],
          status: "published",
          authorId: admin.id,
          publishedAt: new Date("2026-09-05T16:00:00+07:00"),
        },
        {
          title: "ประกาศปรับเวลาการใช้ห้องปฏิบัติการ E12-Lab1",
          content:
            "<p>ร่างประกาศแจ้งปิดปรับปรุงระบบเครือข่ายห้อง <strong>E12-Lab1</strong> ชั่วคราวในช่วงสุดสัปดาห์</p>",
          audiences: ["year1", "year2"],
          status: "draft",
          authorId: admin.id,
          publishedAt: null,
        },
      ],
    });
    console.log("Seeded announcements: 5 published, 1 draft.");
  }

  // -------------------------------------------------------------------- news
  const publishedNewsCount = await prisma.newsArticle.count({
    where: { status: "published" },
  });
  if (publishedNewsCount === 0) {
    await prisma.newsArticle.createMany({
      data: [
        {
          title: "เปิดรับสมัครนักศึกษา! Innovation Event 2026",
          content:
            "<p>ขอเชิญนิสิต CEDT ร่วมส่งผลงานนวัตกรรมซอฟต์แวร์และฮาร์ดแวร์เข้าประกวดในเวที <strong>Innovation Event 2026</strong> ชิงทุนสนับสนุนพัฒนาต่อยอดและรางวัลรวมกว่า 100,000 บาท</p><ul><li>สมัครเป็นทีม ทีมละ 3–4 คน</li><li>ปิดรับสมัครวันที่ 15 สิงหาคม 2569</li></ul>",
          tags: ["competition"],
          status: "published",
          authorId: admin.id,
          publishedAt: new Date("2026-07-24T09:00:00+07:00"),
        },
        {
          title: "กิจกรรม CEDT Job Fair & Career Talk 2026",
          content:
            "<p>พบกับบริษัทเทคโนโลยีชั้นนำกว่า 30 แห่ง พร้อมช่วงเสวนาแนะแนวสายอาชีพด้าน Software Engineering, Data &amp; AI และ Hardware Systems สำหรับนิสิตทุกชั้นปี</p>",
          tags: ["activities", "internship"],
          status: "published",
          authorId: admin.id,
          publishedAt: new Date("2026-07-20T13:00:00+07:00"),
        },
        {
          title: "ทุนการศึกษาต่อยอดนวัตกรรมดิจิทัล ประจำปี 2569",
          content:
            "<p>เปิดรับสมัครนิสิตที่มีผลการเรียนดีและมีความสนใจพัฒนาโครงงานด้าน Digital Technology เพื่อขอรับทุนสนับสนุนการศึกษาและค่าอุปกรณ์วิจัย</p>",
          tags: ["scholarship"],
          status: "published",
          authorId: admin.id,
          publishedAt: new Date("2026-07-15T10:30:00+07:00"),
        },
        {
          title: "เปิดรับสมัครโครงการฝึกงานภาคฤดูร้อนร่วมกับบริษัทพันธมิตร",
          content:
            "<p>นิสิตที่สนใจฝึกงานสาย Full-Stack, Cloud Infrastructure และ Embedded Systems สามารถยื่น Portfolio เพื่อรับการคัดเลือกสัมภาษณ์รอบพิเศษได้แล้ววันนี้</p>",
          tags: ["internship"],
          status: "published",
          authorId: admin.id,
          publishedAt: new Date("2026-07-10T11:00:00+07:00"),
        },
        {
          title: "เสวนาวิชาการ AI Systems Engineering 2026",
          content:
            "<p>ร่างข่าวประชาสัมพันธ์งานเสวนาวิชาการด้านระบบ AI สำหรับภาคอุตสาหกรรม (อยู่ระหว่างรอข้อมูลวิทยากรเพิ่มเติม)</p>",
          tags: ["academic"],
          status: "draft",
          authorId: admin.id,
          publishedAt: null,
        },
      ],
    });
    console.log("Seeded news: 4 published, 1 draft.");
  }

  // ------------------------------------------------------------ news posters
  const existingNewsImageCount = await prisma.newsImage.count();
  if (existingNewsImageCount === 0) {
    const posterPlans: {
      title: string;
      images: { filename: string; rgb: readonly [number, number, number] }[];
    }[] = [
      {
        title: "เปิดรับสมัครนักศึกษา! Innovation Event 2026",
        images: [
          { filename: "innovation-poster-1.png", rgb: [226, 232, 240] },
          { filename: "innovation-poster-2.png", rgb: [203, 213, 225] },
          { filename: "innovation-poster-3.png", rgb: [148, 163, 184] },
        ],
      },
      {
        title: "กิจกรรม CEDT Job Fair & Career Talk 2026",
        images: [{ filename: "job-fair-poster.png", rgb: [209, 213, 219] }],
      },
      {
        title: "ทุนการศึกษาต่อยอดนวัตกรรมดิจิทัล ประจำปี 2569",
        images: [
          { filename: "scholarship-poster-1.png", rgb: [229, 231, 235] },
          { filename: "scholarship-poster-2.png", rgb: [156, 163, 175] },
        ],
      },
      {
        title: "เสวนาวิชาการ AI Systems Engineering 2026",
        images: [{ filename: "ai-seminar-poster.png", rgb: [203, 213, 225] }],
      },
    ];

    let totalSeededImages = 0;
    for (const plan of posterPlans) {
      const article = await prisma.newsArticle.findFirst({
        where: { title: plan.title },
        select: { id: true },
      });
      if (!article) continue;

      await addNewsImages(
        article.id,
        plan.images.map((img) => ({
          filename: img.filename,
          mimeType: "image/png",
          buffer: createPlaceholderPng(420, 594, img.rgb),
        })),
      );
      totalSeededImages += plan.images.length;
    }
    console.log(`Seeded news poster placeholders: ${totalSeededImages} images.`);
  }

  // ----------------------------------------------------------- course change
  await seedCourseChange({
    termId: term1.id,
    staff: { admin, anucha, pimchanok },
    hash,
  });

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
