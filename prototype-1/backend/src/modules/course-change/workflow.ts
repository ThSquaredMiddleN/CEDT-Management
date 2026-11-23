import { createHash } from "node:crypto";
import { PDFDocument, PDFSignature } from "pdf-lib";
import { z } from "zod";
import type {
  Prisma,
  CourseChangeSchedule,
  CourseChangeType,
} from "@prisma/client";
import { prisma, type Tx } from "../../db.js";
import {
  conflict,
  forbidden,
  notFound,
  validation,
  windowClosed,
} from "../../lib/errors.js";
import { isoDate } from "../../lib/time.js";
import type { SessionUser } from "../../plugins/auth.js";
import { activeAdminIds } from "../notifications/service.js";
import {
  event,
  notifyCc,
  getRequest,
  loadVisible,
  loadContext,
  nextRequestNo,
  type SubmitInput,
} from "./service.js";
import { weekOf } from "./timeline.js";

export const PHASES = {
  staff_review: "เจ้าหน้าที่ตรวจคำร้อง",
  student_revision: "รอนิสิตแก้ไขคำร้อง",
  awaiting_signature: "รวบรวมและรอเอกสารลงนาม",
  student_external: "รอนิสิตดำเนินการภายนอก",
  ready_registrar: "รอหลักสูตรส่ง สนท.",
  awaiting_result: "เอกสารครบ · รอผลทะเบียน",
  completed: "เจ้าหน้าที่บันทึกผลทะเบียนแล้ว",
} as const;
export type Phase = keyof typeof PHASES;
export interface Plan {
  scheduleId: string;
  scheduleRevision: number;
  label: string;
  format: string;
  section: string;
  opensOn: string;
  closesOn: string;
  finalOn: string | null;
  teachingStartsOn?: string | null;
  teachingEndsOn?: string | null;
  needsSignature: boolean;
  needsReg: boolean;
  needsPi: boolean;
  needsMerge: boolean;
  registrar: boolean;
  originalReason: string;
}
export const scheduleSchema = z
  .object({
    id: z.string().uuid().optional(),
    revision: z.number().int().nonnegative().optional(),
    termId: z.string().uuid(),
    courseId: z.string().uuid(),
    section: z.string().trim().min(1).max(30),
    requestType: z.enum(["drop", "withdraw"]),
    label: z.string().trim().min(3).max(150),
    format: z.enum(["block", "full_term"]),
    opensOn: z.string().date(),
    closesOn: z.string().date(),
    finalOn: z.string().date().nullable(),
    teachingStartsOn: z.string().date().nullable().optional(),
    teachingEndsOn: z.string().date().nullable().optional(),
    flow: z.enum(["reg_direct", "advisor_pi", "program_registrar"]),
    needsSignature: z.boolean(),
    needsReg: z.boolean(),
    needsPi: z.boolean(),
    needsMerge: z.boolean(),
    published: z.boolean(),
    reason: z.string().trim().min(5).max(500),
  })
  .superRefine((v, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (!!v.teachingStartsOn !== !!v.teachingEndsOn)
      issue("ระบุวันเริ่มและสิ้นสุดช่วงเรียนให้ครบทั้งคู่");
    if (
      v.teachingStartsOn &&
      v.teachingEndsOn &&
      v.teachingStartsOn > v.teachingEndsOn
    )
      issue("วันเริ่มเรียนต้องไม่หลังวันสิ้นสุดช่วงเรียน");
    if (v.flow === "reg_direct" && (v.needsPi || v.needsMerge || !v.needsReg))
      issue(
        "เส้นทาง Reg Chula ใช้สำหรับงาน Reg เท่านั้น หากมี PI ให้เลือกเส้นทาง Reg / PI",
      );
    if (v.opensOn > v.closesOn) issue("วันเปิดรับต้องไม่เกินวันปิดรับ");
    if (v.finalOn && v.closesOn > v.finalOn)
      issue("วันปิดรับต้องไม่หลังวันสอบ Final");
    if (v.needsMerge && (!v.needsSignature || !v.needsReg || !v.needsPi))
      issue("การรวมสองฉบับต้องมีคำร้องลงนาม เอกสารจาก Reg Chula และขั้นส่ง PI");
    if (
      v.flow === "program_registrar" &&
      (v.needsReg || v.needsPi || v.needsMerge)
    )
      issue("เส้นทางหลักสูตรส่ง สนท. ไม่ให้กำหนดงาน Reg/PI ของนิสิตร่วมกัน");
    if (v.flow !== "program_registrar" && !v.needsReg && !v.needsPi)
      issue("กรุณาระบุงาน Reg Chula หรือ PI ที่นิสิตต้องทำ");
    if (v.id && v.revision === undefined)
      issue("ต้องระบุรุ่นกำหนดการก่อนแก้ไข");
  });
export function scheduleView(s: CourseChangeSchedule) {
  return {
    ...s,
    opensOn: isoDate(s.opensOn),
    closesOn: isoDate(s.closesOn),
    finalOn: s.finalOn ? isoDate(s.finalOn) : null,
    teachingStartsOn: s.teachingStartsOn ? isoDate(s.teachingStartsOn) : null,
    teachingEndsOn: s.teachingEndsOn ? isoDate(s.teachingEndsOn) : null,
    updatedAt: s.updatedAt.toISOString(),
  };
}
export async function schedules() {
  const term = await prisma.term.findFirst({ where: { isActive: true } });
  return {
    items: term
      ? (
          await prisma.courseChangeSchedule.findMany({
            where: { termId: term.id },
            orderBy: [{ courseId: "asc" }, { opensOn: "asc" }],
          })
        ).map(scheduleView)
      : [],
  };
}
export async function saveSchedule(
  input: z.infer<typeof scheduleSchema>,
  me: SessionUser,
) {
  const { id, revision, reason, ...body } = input;
  await prisma.$transaction(async (tx) => {
    // All schedule writers and submitters share this term lock, including first publication.
    await tx.$queryRaw`SELECT id FROM terms WHERE id = ${body.termId}::uuid FOR UPDATE`;
    const term = await tx.term.findFirst({
      where: { id: body.termId, isActive: true },
    });
    if (!term) throw validation("ภาคการศึกษาเปลี่ยนแล้ว กรุณาโหลดใหม่");
    const course = await tx.course.findFirst({
      where: {
        id: body.courseId,
        isActive: true,
        catalogSource: { not: null },
      },
    });
    if (!course) throw validation("ไม่พบรายวิชาที่เปิดใช้งานในหลักสูตร");
    if (
      body.opensOn < isoDate(term.startDate) ||
      body.closesOn > isoDate(term.endDate)
    )
      throw validation("กำหนดรับคำร้องต้องอยู่ในภาคการศึกษา");
    const previous = id
      ? await tx.courseChangeSchedule.findUnique({ where: { id } })
      : null;
    if (
      id &&
      (!previous ||
        previous.termId !== body.termId ||
        previous.revision !== revision)
    )
      throw conflict("กำหนดการเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุด");
    if (body.published) {
      const overlap = await tx.courseChangeSchedule.findFirst({
        where: {
          id: id ? { not: id } : undefined,
          termId: body.termId,
          courseId: body.courseId,
          section: body.section,
          requestType: body.requestType,
          published: true,
          opensOn: { lte: new Date(body.closesOn) },
          closesOn: { gte: new Date(body.opensOn) },
        },
      });
      if (overlap)
        throw conflict(
          "มีช่วงรับคำร้องที่ประกาศแล้วทับซ้อนในรายวิชาและตอนเรียนนี้",
        );
    }
    const data = {
      ...body,
      opensOn: new Date(body.opensOn),
      closesOn: new Date(body.closesOn),
      finalOn: body.finalOn ? new Date(body.finalOn) : null,
      teachingStartsOn: body.teachingStartsOn
        ? new Date(body.teachingStartsOn)
        : null,
      teachingEndsOn: body.teachingEndsOn
        ? new Date(body.teachingEndsOn)
        : null,
    };
    const saved = id
      ? await tx.courseChangeSchedule.update({
          where: { id },
          data: { ...data, revision: { increment: 1 } },
        })
      : await tx.courseChangeSchedule.create({ data });
    await tx.courseChangeSettingsEvent.create({
      data: {
        termId: body.termId,
        actorId: me.id,
        reason,
        before: (previous
          ? scheduleView(previous)
          : {}) as unknown as Prisma.InputJsonValue,
        after: scheduleView(saved) as unknown as Prisma.InputJsonValue,
      },
    });
  });
  return schedules();
}
/** Specific Section takes precedence over '*', even when its published period is closed. */
export function matchingSchedules(
  rows: CourseChangeSchedule[],
  courseId: string,
  section: string | null,
  type: CourseChangeType,
) {
  const candidates = rows.filter(
    (s) => s.published && s.courseId === courseId && s.requestType === type,
  );
  const specific = section
    ? candidates.filter((s) => s.section === section)
    : [];
  return specific.length
    ? specific
    : candidates.filter((s) => s.section === "*");
}
export function windowView(
  s: CourseChangeSchedule,
  today: string,
  start: string,
) {
  return {
    requestType: s.requestType,
    flow: s.flow,
    weekFrom: weekOf(start, isoDate(s.opensOn)),
    weekTo: weekOf(start, isoDate(s.closesOn)),
    opensOn: isoDate(s.opensOn),
    closesOn: isoDate(s.closesOn),
    isOpen: today >= isoDate(s.opensOn) && today <= isoDate(s.closesOn),
    scheduleId: s.id,
    scheduleRevision: s.revision,
  };
}
export async function submitRequest(
  input: SubmitInput,
  me: SessionUser,
  today: string,
) {
  const id = await prisma.$transaction(async (tx) => {
    if (input.clientRequestId) {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`${me.id}:${input.clientRequestId}`}, 0))`;
      const previous = await tx.courseChangeRequest.findUnique({
        where: {
          studentId_clientRequestId: {
            studentId: me.id,
            clientRequestId: input.clientRequestId,
          },
        },
      });
      if (previous) {
        const plan = previous.workflowPlan as unknown as Plan | null;
        if (
          previous.requestType !== input.requestType ||
          previous.courseId !== input.courseId ||
          (plan?.originalReason ?? previous.reason) !== input.reason ||
          (input.routePreview && input.routePreview.termId !== previous.termId)
        )
          throw conflict(
            "ข้อมูลของการยื่นครั้งนี้เปลี่ยนแล้ว กรุณาตรวจสอบคำร้องเดิมก่อนเริ่มรายการใหม่",
          );
        return previous.id;
      }
    }
    const ctx = await loadContext(today, tx);
    if (!ctx.term) throw windowClosed("ยังไม่มีภาคการศึกษาที่เปิดอยู่");
    await tx.$queryRaw`SELECT id FROM terms WHERE id = ${ctx.term.id}::uuid FOR SHARE`;
    const enrollment = await tx.enrollment.findUnique({
      where: {
        studentId_termId_courseId: {
          studentId: me.id,
          termId: ctx.term.id,
          courseId: input.courseId,
        },
      },
      include: { course: true },
    });
    if (
      !enrollment ||
      !enrollment.course.catalogSource ||
      !enrollment.course.isActive
    )
      throw validation("ไม่พบรายวิชาที่เปิดใช้งานในข้อมูลลงทะเบียนของคุณ");
    const allowed = await tx.allowedCourse.findUnique({
      where: {
        termId_courseId: { termId: ctx.term.id, courseId: input.courseId },
      },
    });
    if (
      !allowed ||
      !(input.requestType === "drop"
        ? allowed.allowDrop
        : allowed.allowWithdraw)
    )
      throw validation("หลักสูตรไม่ได้เปิดให้ดำเนินการรายวิชานี้");
    const rows = await tx.courseChangeSchedule.findMany({
      where: { termId: ctx.term.id, courseId: input.courseId },
    });
    const schedule = matchingSchedules(
      rows,
      input.courseId,
      enrollment.section,
      input.requestType,
    ).find((s) => today >= isoDate(s.opensOn) && today <= isoDate(s.closesOn));
    if (!schedule)
      throw windowClosed(
        "ไม่มีช่วงรับคำร้องรายวิชาและตอนเรียนนี้ที่ประกาศเปิดอยู่",
      );
    const preview = input.routePreview;
    if (
      preview &&
      (preview.termId !== ctx.term.id ||
        preview.flow !== schedule.flow ||
        preview.opensOn !== isoDate(schedule.opensOn) ||
        preview.closesOn !== isoDate(schedule.closesOn) ||
        preview.scheduleId !== schedule.id ||
        preview.scheduleRevision !== schedule.revision)
    )
      throw conflict(
        "ช่วงเวลาหรือเส้นทางคำร้องเปลี่ยนแล้ว กรุณาตรวจสอบและยืนยันอีกครั้ง",
      );
    const duplicate = await tx.courseChangeRequest.findFirst({
      where: {
        studentId: me.id,
        termId: ctx.term.id,
        courseId: input.courseId,
        status: { in: ["pending_approval", "processing", "completed"] },
      },
    });
    if (duplicate)
      throw conflict(
        `มีคำร้องสำหรับรายวิชานี้อยู่แล้ว (${duplicate.requestNo})`,
      );
    const student = await tx.user.findUniqueOrThrow({
      where: { id: me.id },
      include: { advisor: true },
    });
    const plan: Plan = {
      scheduleId: schedule.id,
      scheduleRevision: schedule.revision,
      label: schedule.label,
      format: schedule.format,
      section: schedule.section,
      opensOn: isoDate(schedule.opensOn),
      closesOn: isoDate(schedule.closesOn),
      finalOn: schedule.finalOn ? isoDate(schedule.finalOn) : null,
      teachingStartsOn: schedule.teachingStartsOn
        ? isoDate(schedule.teachingStartsOn)
        : null,
      teachingEndsOn: schedule.teachingEndsOn
        ? isoDate(schedule.teachingEndsOn)
        : null,
      needsSignature: schedule.needsSignature,
      needsReg: schedule.needsReg,
      needsPi: schedule.needsPi,
      needsMerge: schedule.needsMerge,
      registrar: schedule.flow === "program_registrar",
      originalReason: input.reason,
    };
    const r = await tx.courseChangeRequest.create({
      data: {
        clientRequestId: input.clientRequestId,
        requestNo: await nextRequestNo(tx),
        studentId: me.id,
        termId: ctx.term.id,
        courseId: input.courseId,
        requestType: input.requestType,
        flow: schedule.flow,
        weekNo: ctx.week,
        workflowVersion: 2,
        phase: "staff_review",
        workflowPlan: plan as unknown as Prisma.InputJsonValue,
        status: "pending_approval",
        reason: input.reason,
        snapshot: {
          studentName: [student.titlePrefix, student.name]
            .filter(Boolean)
            .join(" "),
          studentNo: student.studentNo ?? "",
          courseCode: enrollment.course.code,
          courseName: enrollment.course.name,
          section: enrollment.section,
          credits: enrollment.credits,
          advisorId: student.advisorId,
          advisorName: student.advisor?.name ?? null,
          termLabel: ctx.term.label,
        },
      },
    });
    await event(tx, r.id, "submitted", me.id, {
      note: "ยื่นคำร้อง · รอเจ้าหน้าที่ตรวจ",
      payload: { phase: "staff_review", workflowVersion: 2 },
    });
    await notifyCc(tx, {
      userIds: await activeAdminIds(tx),
      type: "cc_submitted",
      message: `${r.requestNo} รอเจ้าหน้าที่ตรวจคำร้อง`,
      requestId: r.id,
      requestNo: r.requestNo,
    });
    return r.id;
  });
  return getRequest(id, me);
}

export const actionSchema = z.object({
  revision: z.number().int().nonnegative(),
  action: z.enum([
    "request_revision",
    "reject",
    "request_documents",
    "resubmit",
    "review",
    "signature_sent",
    "return_signed",
    "reg_done",
    "pi_done",
    "documents_checked",
    "registrar_sent",
    "complete",
  ]),
  note: z.string().trim().max(1000).default(""),
  reason: z.string().trim().min(5).max(1000).optional(),
});
export async function lockedRequest(
  tx: Tx,
  id: string,
  revision: number,
  me: SessionUser,
) {
  await tx.$queryRaw`SELECT id FROM course_change_requests WHERE id = ${id}::uuid FOR UPDATE`;
  const r = await loadVisible(id, me, tx);
  if (r.workflowVersion !== 2 || r.revision !== revision)
    throw conflict("คำร้องเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนทำรายการ");
  if (!["pending_approval", "processing"].includes(r.status))
    throw conflict("คำร้องนี้ปิดแล้ว");
  return r;
}
export async function action(
  id: string,
  body: z.infer<typeof actionSchema>,
  me: SessionUser,
) {
  await prisma.$transaction(async (tx) => {
    const r = await lockedRequest(tx, id, body.revision, me);
    const plan = r.workflowPlan as unknown as Plan;
    const studentAction = ["resubmit", "reg_done", "pi_done"].includes(
      body.action,
    );
    if (
      studentAction
        ? me.role !== "student" || r.studentId !== me.id
        : me.role !== "staff"
    )
      throw forbidden();
    const requiredNote = [
      "request_revision",
      "reject",
      "request_documents",
      "signature_sent",
      "return_signed",
      "reg_done",
      "pi_done",
      "registrar_sent",
      "complete",
    ].includes(body.action);
    if (requiredNote && body.note.length < 5)
      throw validation("ระบุรายละเอียดหรือหลักฐานอ้างอิงอย่างน้อย 5 ตัวอักษร");
    const files = await tx.courseChangeFile.findMany({
      where: { requestId: id },
      select: { id: true, kind: true },
    });
    const has = (kind: string) => files.some((f) => f.kind === kind);
    const boundary = r.events
      .map((e) => (e.payload as { action?: string } | null)?.action)
      .lastIndexOf("request_documents");
    const currentEvents = r.events.slice(Math.max(0, boundary));
    const was = (step: string) =>
      currentEvents.some(
        (e) =>
          e.eventType === "workflow_updated" &&
          (e.payload as { action?: string } | null)?.action === step,
      );
    let phase = r.phase as Phase;
    let status = r.status;
    const data: Prisma.CourseChangeRequestUpdateInput = {};
    const requirePhase = (...expected: Phase[]) => {
      if (!expected.includes(phase))
        throw conflict("ขั้นตอนคำร้องเปลี่ยนแล้ว กรุณาตรวจสอบข้อมูลล่าสุด");
    };
    switch (body.action) {
      case "reject":
        requirePhase("staff_review");
        status = "rejected";
        data.rejectReason = body.note;
        data.decidedBy = { connect: { id: me.id } };
        data.decidedAt = new Date();
        break;
      case "request_documents":
        requirePhase("student_external", "awaiting_result");
        phase = "student_external";
        break;
      case "request_revision":
        requirePhase("staff_review");
        phase = "student_revision";
        break;
      case "resubmit":
        requirePhase("student_revision");
        if (!body.reason) throw validation("ระบุเหตุผลคำร้องฉบับแก้ไข");
        data.reason = body.reason;
        phase = "staff_review";
        break;
      case "review":
        requirePhase("staff_review");
        phase = plan.needsSignature
          ? "awaiting_signature"
          : plan.registrar
            ? "ready_registrar"
            : "student_external";
        status = "processing";
        break;
      case "signature_sent":
        requirePhase("awaiting_signature");
        break;
      case "return_signed":
        requirePhase("awaiting_signature");
        if (!has("signed_petition"))
          throw validation("แนบคำร้องที่ลงนามแล้วก่อนคืนเอกสาร");
        phase = plan.registrar ? "ready_registrar" : "student_external";
        break;
      case "reg_done":
        requirePhase("student_external");
        if (!plan.needsReg || was("reg_done"))
          throw conflict("ไม่มีงาน Reg Chula ที่รอบันทึก");
        break;
      case "pi_done":
        requirePhase("student_external");
        if (!plan.needsPi || was("pi_done"))
          throw conflict("ไม่มีงาน PI ที่รอบันทึก");
        if (plan.needsMerge && !was("files_merged"))
          throw validation("รวมเอกสารสองฉบับและตรวจไฟล์ก่อนบันทึกส่ง PI");
        break;
      case "documents_checked":
        requirePhase("student_external");
        if (
          (plan.needsReg && !was("reg_done")) ||
          (plan.needsPi && !was("pi_done"))
        )
          throw validation("นิสิตยังบันทึกงาน Reg Chula/PI ไม่ครบ");
        phase = "awaiting_result";
        break;
      case "registrar_sent":
        requirePhase("ready_registrar");
        phase = "awaiting_result";
        break;
      case "complete":
        requirePhase("awaiting_result");
        phase = "completed";
        status = "completed";
        data.completedAt = new Date();
        break;
    }
    await tx.courseChangeRequest.update({
      where: { id },
      data: { ...data, phase, status, revision: { increment: 1 } },
    });
    await event(
      tx,
      id,
      body.action === "complete"
        ? "completed"
        : body.action === "reject"
          ? "rejected"
          : "workflow_updated",
      me.id,
      {
        note: body.note || PHASES[phase],
        payload: {
          action: body.action,
          phase,
          previousPhase: r.phase,
          releasedFileIds:
            body.action === "return_signed"
              ? files
                  .filter((f) => f.kind === "signed_petition")
                  .map((f) => f.id)
              : undefined,
          previousReason: body.action === "resubmit" ? r.reason : undefined,
        },
      },
    );
    await notifyCc(tx, {
      userIds: me.role === "student" ? await activeAdminIds(tx) : [r.studentId],
      type:
        body.action === "complete"
          ? "cc_completed"
          : body.action === "reject"
            ? "cc_rejected"
            : "cc_approved",
      message: `${r.requestNo} · ${body.action === "reject" ? `ไม่รับดำเนินการ: ${body.note}` : PHASES[phase]}`,
      requestId: id,
      requestNo: r.requestNo,
    });
  });
  return getRequest(id, me);
}

export const FILE_KINDS = [
  "student_petition",
  "signed_petition",
  "reg_petition",
  "evidence",
] as const;
export async function validatePdf(data: Buffer) {
  if (
    data.length > 5 * 1024 * 1024 ||
    !data.subarray(0, 5).equals(Buffer.from("%PDF-"))
  )
    throw validation("ใช้ไฟล์ PDF ขนาดไม่เกิน 5 MB");
  try {
    const pdf = await PDFDocument.load(data);
    if (!pdf.getPageCount() || pdf.getPageCount() > 100)
      throw new Error("pages");
  } catch {
    throw validation(
      "อ่าน PDF ไม่ได้ กรุณาใช้ไฟล์ที่ไม่เข้ารหัสและมี 1–100 หน้า",
    );
  }
}
const digest = (data: Buffer) =>
  createHash("sha256").update(data).digest("hex");
export async function uploadFile(
  id: string,
  revision: number,
  kind: (typeof FILE_KINDS)[number],
  filename: string,
  data: Buffer,
  me: SessionUser,
) {
  await validatePdf(data);
  await prisma.$transaction(async (tx) => {
    const r = await lockedRequest(tx, id, revision, me);
    if (
      me.role === "student" &&
      (kind === "signed_petition" ||
        !["staff_review", "student_revision", "student_external"].includes(
          r.phase!,
        ))
    )
      throw forbidden("ไม่สามารถแนบเอกสารชนิดนี้ในขั้นตอนปัจจุบัน");
    if (
      me.role === "staff" &&
      kind === "signed_petition" &&
      r.phase !== "awaiting_signature"
    )
      throw conflict("ยังไม่อยู่ในขั้นรอเอกสารลงนาม");
    if ((await tx.courseChangeFile.count({ where: { requestId: id } })) >= 30)
      throw validation("แนบได้ไม่เกิน 30 ไฟล์ต่อคำร้อง");
    const safe =
      filename
        .replace(/[\\/\r\n\x00-\x1f]/g, "_")
        .slice(0, 150)
        .replace(/\.pdf$/i, "") + ".pdf";
    const file = await tx.courseChangeFile.create({
      data: {
        requestId: id,
        kind,
        filename: safe,
        data: new Uint8Array(data),
        sha256: digest(data),
        uploaderId: me.id,
      },
    });
    await tx.courseChangeRequest.update({
      where: { id },
      data: { revision: { increment: 1 } },
    });
    await event(tx, id, "workflow_updated", me.id, {
      note: `แนบเอกสาร ${safe}`,
      payload: {
        action: "file_uploaded",
        fileId: file.id,
        kind,
        phase: r.phase,
      },
    });
  });
  return getRequest(id, me);
}
export async function mergeFiles(
  id: string,
  revision: number,
  ids: string[],
  me: SessionUser,
) {
  await prisma.$transaction(async (tx) => {
    const r = await lockedRequest(tx, id, revision, me);
    if (
      r.phase !== "student_external" ||
      !(r.workflowPlan as unknown as Plan).needsMerge
    )
      throw conflict("คำร้องนี้ยังไม่อยู่ในขั้นรวมสองฉบับ");
    if (me.role !== "student")
      throw forbidden("ให้นิสิตตรวจและรวมเอกสารของตนเอง");
    const files = await tx.courseChangeFile.findMany({
      where: { requestId: id, id: { in: ids } },
    });
    if (
      files.length !== 2 ||
      !files.some((f) => f.kind === "signed_petition") ||
      !files.some((f) => f.kind === "reg_petition")
    )
      throw validation(
        "เลือกคำร้องลงนามหนึ่งฉบับและเอกสาร Reg Chula หนึ่งฉบับ",
      );
    const boundary = r.events
      .map((e) => (e.payload as { action?: string } | null)?.action)
      .lastIndexOf("request_documents");
    if (
      r.events
        .slice(Math.max(0, boundary))
        .some(
          (e) =>
            (e.payload as { action?: string } | null)?.action === "pi_done",
        )
    )
      throw conflict(
        "บันทึกส่ง PI แล้ว ไม่สามารถเปลี่ยนชุดเอกสารที่ส่งย้อนหลัง",
      );
    if ((await tx.courseChangeFile.count({ where: { requestId: id } })) >= 30)
      throw validation("จำนวนไฟล์ถึงขีดจำกัดแล้ว");
    const pdf = await PDFDocument.create();
    for (const fileId of ids) {
      const file = files.find((f) => f.id === fileId)!;
      const source = await PDFDocument.load(file.data);
      const form = source.getForm();
      if (form.getFields().some((field) => field instanceof PDFSignature))
        throw validation(
          "ไฟล์มีช่องลายเซ็นดิจิทัล การรวมอาจทำให้ลายเซ็นใช้ไม่ได้ กรุณาให้เจ้าหน้าที่ยืนยันวิธีจัดการก่อน",
        );
      form.flatten();
      const pages = await pdf.copyPages(source, source.getPageIndices());
      pages.forEach((page) => pdf.addPage(page));
    }
    const data = Buffer.from(await pdf.save());
    if (data.length > 10 * 1024 * 1024 || pdf.getPageCount() > 200)
      throw validation("ไฟล์รวมเกินขนาดหรือจำนวนหน้าที่รองรับ");
    const merged = await tx.courseChangeFile.create({
      data: {
        requestId: id,
        kind: "merged",
        filename: `${r.requestNo}_merged.pdf`,
        data: new Uint8Array(data),
        sha256: digest(data),
        uploaderId: me.id,
      },
    });
    await tx.courseChangeRequest.update({
      where: { id },
      data: { revision: { increment: 1 } },
    });
    await event(tx, id, "workflow_updated", me.id, {
      note: "รวม PDF ตามลำดับที่นิสิตเลือก · โปรดดาวน์โหลดตรวจสอบก่อนส่ง PI",
      payload: {
        action: "files_merged",
        fileId: merged.id,
        sourceIds: ids,
        phase: r.phase,
      },
    });
  });
  return getRequest(id, me);
}
export async function downloadFile(
  id: string,
  fileId: string,
  me: SessionUser,
) {
  await loadVisible(id, me);
  const file = await prisma.courseChangeFile.findFirst({
    where: { id: fileId, requestId: id },
  });
  if (!file) throw notFound("ไม่พบเอกสาร");
  if (me.role === "student" && file.kind === "signed_petition") {
    const request = await loadVisible(id, me);
    const released = request.events.flatMap(
      (e) =>
        (e.payload as { releasedFileIds?: string[] } | null)?.releasedFileIds ??
        [],
    );
    if (!released.includes(file.id)) throw notFound("เอกสารยังไม่ได้ส่งคืน");
  }
  return file;
}

/** v2 consumers receive real human workflow steps, never the historical mock handoffs. */
export function workflowStepViews(r: {
  phase: string | null;
  status: string;
  workflowPlan: Prisma.JsonValue | null;
  createdAt: Date;
  completedAt: Date | null;
  events: { createdAt: Date; payload: Prisma.JsonValue | null }[];
}) {
  const plan = r.workflowPlan as unknown as Plan;
  const keys: (Phase | "submitted")[] = [
    "submitted",
    "staff_review",
    ...(plan.needsSignature ? ["awaiting_signature" as const] : []),
    plan.registrar ? "ready_registrar" : "student_external",
    "awaiting_result",
    "completed",
  ];
  const current =
    r.status === "completed"
      ? keys.length
      : keys.indexOf(
          r.phase === "student_revision" ? "staff_review" : (r.phase as Phase),
        );
  return keys.map((key, index) => ({
    key,
    label:
      key === "submitted"
        ? "ยื่นคำร้อง"
        : key === "staff_review" && r.phase === "student_revision"
          ? PHASES.student_revision
          : PHASES[key as Phase],
    state:
      index < current
        ? "done"
        : index === current
          ? ["cancelled", "rejected"].includes(r.status)
            ? "halted"
            : "current"
          : "upcoming",
    at:
      key === "submitted"
        ? r.createdAt.toISOString()
        : key === "completed"
          ? (r.completedAt?.toISOString() ?? null)
          : (r.events
              .find(
                (e) =>
                  (e.payload as { previousPhase?: string } | null)
                    ?.previousPhase === key,
              )
              ?.createdAt.toISOString() ?? null),
  }));
}
