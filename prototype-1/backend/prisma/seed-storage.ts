import type { Prisma, PrismaClient, StorageUnitStatus } from "@prisma/client";
import { groupNameKey } from "../src/core/groups.js";

/**
 * Storage demo and test data: the same scenario as the old frontend mock.
 * Students: 6800000001 (student@, Group 09), 6800000002 (student2@, Group 09 + ชมรมหุ่นยนต์),
 * 6800000003 (ta@, ชมรมหุ่นยนต์), 6800000004 (no account, Group 02), 6800000005 (no account, personal).
 * Safe to run again: storage tables are emptied and refilled; core groups are found or created.
 */
export const SEMESTER_END = new Date("2027-03-31T17:00:00+07:00");
const T0 = new Date("2026-11-10T09:00:00+07:00").getTime();
const DAY = 24 * 60 * 60 * 1000;
const at = (ms: number) => new Date(ms);

async function ensureGroup(
  prisma: PrismaClient,
  g: { type: "course_section" | "club"; name: string; courseId: string | null; termId: string | null },
  members: { studentNo: string; role?: "member" | "leader" }[],
): Promise<string> {
  const nameKey = groupNameKey(g.name);
  const found = await prisma.group.findFirst({ where: { nameKey, courseId: g.courseId, termId: g.termId, section: null } });
  const group = found ?? (await prisma.group.create({ data: { ...g, nameKey } }));
  for (const m of members) {
    await prisma.groupMember.upsert({
      where: { groupId_studentNo: { groupId: group.id, studentNo: m.studentNo } },
      update: {},
      create: { groupId: group.id, studentNo: m.studentNo, role: m.role ?? "member" },
    });
  }
  return group.id;
}

export async function seedStorage(prisma: PrismaClient): Promise<void> {
  const term = await prisma.term.findFirstOrThrow({ where: { isActive: true } });
  const course = await prisma.course.findUniqueOrThrow({ where: { code: "CEDT205" } });
  const userId = async (email: string) => (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
  const student1 = await userId("student@test.local");
  const ta = await userId("ta@test.local");
  const storekeeper = await userId("storekeeper@test.local");

  const group09 = await ensureGroup(
    prisma,
    { type: "course_section", name: "Group 09", courseId: course.id, termId: term.id },
    [{ studentNo: "6800000001", role: "leader" }, { studentNo: "6800000002" }],
  );
  const group02 = await ensureGroup(
    prisma,
    { type: "course_section", name: "Group 02", courseId: course.id, termId: term.id },
    [{ studentNo: "6800000004", role: "leader" }],
  );
  const robotics = await ensureGroup(
    prisma,
    { type: "club", name: "ชมรมหุ่นยนต์", courseId: null, termId: null },
    [{ studentNo: "6800000002" }, { studentNo: "6800000003", role: "leader" }],
  );

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`TRUNCATE storage_qc_task_items, storage_qc_tasks, storage_owed_items, storage_reservations,
      storage_request_lines, storage_units, storage_requests, storage_items`;
    await tx.$executeRaw`SELECT setval('storage_request_seq', 104, true)`;
    await tx.$executeRaw`SELECT setval('storage_qc_task_seq', 299, true)`;
    await tx.storageSetting.upsert({ where: { id: 1 }, update: { defaultDueAt: SEMESTER_END }, create: { id: 1, defaultDueAt: SEMESTER_END } });

    const pi = await tx.storageItem.create({ data: { code: "EQ-001", name: "Raspberry Pi 5 (8GB)", isUnique: true } });
    const bb = await tx.storageItem.create({
      data: { code: "EQ-002", name: "Breadboard 830 Points", isUnique: false, bulkAvailable: 42, bulkQc: 5, bulkDamaged: 3, bulkLost: 0, bulkTotal: 55 },
    });
    const jw = await tx.storageItem.create({
      data: { code: "EQ-003", name: "Jumper Wire (M-M)", isUnique: false, bulkAvailable: 145, bulkQc: 5, bulkDamaged: 40, bulkLost: 10, bulkTotal: 200 },
    });
    const servo = await tx.storageItem.create({ data: { code: "EQ-004", name: "Servo Motor SG90", isUnique: true } });

    // EQ-001-001..005 shelf, 006-007 QC, 008-009 damaged, 010 lost, 011 out (REQ-B-100). EQ-004-001..020 shelf.
    const piStatus = (n: number): StorageUnitStatus =>
      n <= 5 ? "available" : n <= 7 ? "qc" : n <= 9 ? "damaged" : n === 10 ? "lost" : "out";
    await tx.storageUnit.createMany({
      data: Array.from({ length: 11 }, (_, i) => ({ serial: `EQ-001-${String(i + 1).padStart(3, "0")}`, itemId: pi.id, status: piStatus(i + 1) })),
    });
    await tx.storageUnit.createMany({
      data: Array.from({ length: 20 }, (_, i) => ({ serial: `EQ-004-${String(i + 1).padStart(3, "0")}`, itemId: servo.id })),
    });

    const r100 = await tx.storageRequest.create({
      data: {
        requestNo: "REQ-B-100", channel: "click_collect", groupId: group09, requestedById: student1, studentNo: "6800000001",
        status: "closed", createdAt: at(T0 - 10 * DAY), pickedUpAt: at(T0 - 9 * DAY), dueAt: SEMESTER_END,
        pickupAt: at(T0 - 9 * DAY), pickupLocation: "counter", pickupRemark: "",
        lines: { create: [{ itemId: pi.id, reqQty: 1, issuedQty: 1 }, { itemId: bb.id, reqQty: 5, issuedQty: 5 }] },
      },
    });
    await tx.storageUnit.update({ where: { serial: "EQ-001-011" }, data: { requestId: r100.id } });
    await tx.storageOwedItem.create({ data: { requestId: r100.id, itemId: pi.id, serial: "EQ-001-011", qty: 1, createdAt: at(T0 - 9 * DAY) } });
    await tx.storageOwedItem.create({ data: { requestId: r100.id, itemId: bb.id, qty: 5, createdAt: at(T0 - 9 * DAY) } });

    await tx.storageRequest.create({
      data: {
        requestNo: "REQ-B-101", channel: "click_collect", groupId: group09, requestedById: student1, studentNo: "6800000001",
        createdAt: at(T0), lines: { create: [{ itemId: pi.id, reqQty: 2 }, { itemId: bb.id, reqQty: 5 }] },
      },
    });
    await tx.storageRequest.create({
      data: {
        requestNo: "REQ-B-102", channel: "click_collect", groupId: group02, requestedById: null, studentNo: "6800000004",
        status: "rejected", rejectReason: "อุปกรณ์ไม่ตรงกับรายวิชา", rejectedById: storekeeper, rejectedAt: at(T0 - DAY + 3600_000),
        createdAt: at(T0 - DAY), lines: { create: [{ itemId: bb.id, reqQty: 3 }] },
      },
    });
    await tx.storageRequest.create({
      data: {
        requestNo: "REQ-B-103", channel: "click_collect", groupId: robotics, requestedById: ta, studentNo: "6800000003",
        createdAt: at(T0 + 1000), lines: { create: [{ itemId: servo.id, reqQty: 4 }, { itemId: pi.id, reqQty: 1 }] },
      },
    });
    await tx.storageRequest.create({
      data: {
        requestNo: "REQ-B-104", channel: "click_collect", groupId: null, requestedById: null, studentNo: "6800000005",
        status: "unfulfilled", createdAt: at(T0 - 2 * DAY), lines: { create: [{ itemId: jw.id, reqQty: 20 }] },
      },
    });

    const task = (
      taskNo: string,
      ageDays: number,
      extra: Omit<Prisma.StorageQcTaskUncheckedCreateInput, "taskNo" | "kind" | "createdAt">,
    ) => tx.storageQcTask.create({ data: { taskNo, kind: "Face-to-Face Return", createdAt: at(T0 - ageDays * DAY), ...extra } });
    const t201 = await task("REQ-R-201", 4, { groupLabel: "Group 09", requesterLabel: "นิสิต ทดสอบ" });
    await tx.storageQcTaskItem.createMany({
      data: [
        { taskId: t201.id, itemId: pi.id, serial: "EQ-001-006", qty: 1 },
        { taskId: t201.id, itemId: pi.id, serial: "EQ-001-007", qty: 1 },
        { taskId: t201.id, itemId: bb.id, qty: 5 },
      ],
    });
    const t202 = await task("REQ-R-202", 5, {
      groupLabel: "Group 02", requesterLabel: "6800000004", status: "pending_payment", fineSatang: 150000,
      fineRemark: "Raspberry Pi สูญหาย 1 เครื่อง", slipAmountSatang: 150000, slipTransferredAt: "28 ต.ค. 2026 14:30", slipRef: "REF-889021",
    });
    await tx.storageQcTaskItem.create({ data: { taskId: t202.id, itemId: pi.id, serial: "EQ-001-010", qty: 1, status: "lost", resLost: 1 } });
    const t203 = await task("REQ-R-203", 6, { groupLabel: "ส่วนตัว", requesterLabel: "6800000005", status: "closed" });
    await tx.storageQcTaskItem.create({ data: { taskId: t203.id, itemId: servo.id, serial: "EQ-004-017", qty: 1, status: "available", resAvailable: 1 } });
    const t204 = await task("REQ-R-204", 7, { groupLabel: "ชมรมหุ่นยนต์", requesterLabel: "TA ตรวจสภาพ ทดสอบ" });
    await tx.storageQcTaskItem.create({ data: { taskId: t204.id, itemId: jw.id, qty: 5 } });
  });
  console.log("Seed: storage (4 items, 5 requests, 4 QC tasks).");
}
