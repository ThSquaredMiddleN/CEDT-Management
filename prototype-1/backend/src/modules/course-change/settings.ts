import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma, type Tx } from "../../db.js";
import { conflict, validation, windowClosed } from "../../lib/errors.js";
import { isoDate } from "../../lib/time.js";
import type { SessionUser } from "../../plugins/auth.js";

const windowSchema = z.object({
  requestType: z.enum(["drop", "withdraw"]),
  weekFrom: z.number().int().min(1).max(18),
  weekTo: z.number().int().min(1).max(18),
  flow: z.enum(["reg_direct", "advisor_pi", "program_registrar"]),
}).refine((w) => w.weekFrom <= w.weekTo, { message: "สัปดาห์เริ่มต้องไม่เกินสัปดาห์สิ้นสุด" });

export const settingsSchema = z.object({
  termId: z.string().uuid(),
  revision: z.string().length(64),
  reason: z.string().trim().min(5, "ระบุเหตุผลการแก้ไขอย่างน้อย 5 ตัวอักษร").max(500),
  windows: z.array(windowSchema).max(36),
  courses: z.array(z.object({
    courseId: z.string().uuid(), allowDrop: z.boolean(), allowWithdraw: z.boolean(),
    note: z.string().trim().max(500).nullable(),
  })).max(5000),
}).superRefine((input, ctx) => {
  for (const type of ["drop", "withdraw"] as const) {
    const windows = input.windows.filter((w) => w.requestType === type).sort((a, b) => a.weekFrom - b.weekFrom);
    for (let i = 1; i < windows.length; i++) {
      if (windows[i]!.weekFrom <= windows[i - 1]!.weekTo) {
        ctx.addIssue({ code: "custom", path: ["windows"], message: `ช่วงสัปดาห์ของ ${type === "drop" ? "ลด" : "ถอน"}รายวิชาทับซ้อนกัน` });
      }
    }
  }
  if (new Set(input.courses.map((c) => c.courseId)).size !== input.courses.length) {
    ctx.addIssue({ code: "custom", path: ["courses"], message: "มีรายวิชาซ้ำ" });
  }
});

async function loadSettings(tx: Tx) {
  const term = await tx.term.findFirst({ where: { isActive: true } });
  if (!term) throw windowClosed("ยังไม่มีภาคการศึกษาที่เปิดอยู่");
  const [windows, catalog, allowed] = await Promise.all([
    tx.courseChangeWindow.findMany({ where: { termId: term.id }, orderBy: [{ requestType: "asc" }, { weekFrom: "asc" }] }),
    tx.course.findMany({ where: { catalogSource: { not: null } }, orderBy: { code: "asc" } }),
    tx.allowedCourse.findMany({ where: { termId: term.id } }),
  ]);
  const byId = new Map(allowed.map((c) => [c.courseId, c]));
  const rules = windows.map(({ requestType, weekFrom, weekTo, flow }) => ({ requestType, weekFrom, weekTo, flow }));
  const courses = catalog.map((c) => ({ courseId: c.id, courseCode: c.code, courseName: c.name,
    isActive: c.isActive, allowDrop: byId.get(c.id)?.allowDrop ?? false,
    allowWithdraw: byId.get(c.id)?.allowWithdraw ?? false, note: byId.get(c.id)?.note ?? null }));
  const snapshot = { termId: term.id, startDate: isoDate(term.startDate), windows: rules, courses };
  const revision = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  return { term: { id: term.id, label: `ภาคการศึกษาที่ ${term.termNumber}/${term.academicYear + 543}`, startDate: isoDate(term.startDate) },
    windows: rules, courses, revision, snapshot };
}

export async function getSettings() {
  return prisma.$transaction(async (tx) => {
    const { snapshot: _snapshot, ...data } = await loadSettings(tx);
    const events = await tx.courseChangeSettingsEvent.findMany({ where: { termId: data.term.id },
      include: { actor: true }, orderBy: { id: "desc" }, take: 10 });
    return { ...data, history: events.map((e) => ({ id: e.id.toString(), actorName: e.actor.name,
      reason: e.reason, createdAt: e.createdAt.toISOString() })) };
  });
}

export async function saveSettings(input: z.infer<typeof settingsSchema>, me: SessionUser) {
  await prisma.$transaction(async (tx) => {
    // Serialize changes to the same term, then reject stale browser drafts.
    await tx.$queryRaw`SELECT id FROM terms WHERE id = ${input.termId}::uuid FOR UPDATE`;
    const current = await loadSettings(tx);
    if (current.term.id !== input.termId || current.revision !== input.revision) {
      throw conflict("การตั้งค่าถูกแก้ไขแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก");
    }
    const ids = new Set(current.courses.map((c) => c.courseId));
    if (input.courses.length !== ids.size || input.courses.some((c) => !ids.has(c.courseId))) {
      throw validation("รายการรายวิชาเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุด");
    }
    await tx.courseChangeWindow.deleteMany({ where: { termId: input.termId } });
    if (input.windows.length) await tx.courseChangeWindow.createMany({ data: input.windows.map((w) => ({ ...w, termId: input.termId })) });
    for (const course of input.courses) {
      const data = { allowDrop: course.allowDrop, allowWithdraw: course.allowWithdraw, note: course.note || null };
      await tx.allowedCourse.upsert({ where: { termId_courseId: { termId: input.termId, courseId: course.courseId } },
        update: data, create: { ...data, termId: input.termId, courseId: course.courseId } });
    }
    const updated = await loadSettings(tx);
    await tx.courseChangeSettingsEvent.create({ data: { termId: input.termId, actorId: me.id,
      reason: input.reason, before: current.snapshot as unknown as Prisma.InputJsonValue,
      after: updated.snapshot as unknown as Prisma.InputJsonValue } });
  });
  return getSettings();
}
