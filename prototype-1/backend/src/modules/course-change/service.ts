import { phaseTiming } from "./queue.js";
import { matchingSchedules, windowView, workflowStepViews } from "./workflow.js";
import type {
  CourseChangeEventType,
  CourseChangeFlow,
  CourseChangeStatus,
  CourseChangeType,
  NotificationType,
  Prisma,
} from "@prisma/client";
import { config } from "../../config.js";
import { prisma, type Tx } from "../../db.js";
import {
  conflict,
  invalidTransition,
  notFound,
  validation,
  windowClosed,
} from "../../lib/errors.js";
import { isoDate, todayISO } from "../../lib/time.js";
import type { SessionUser } from "../../plugins/auth.js";
import { activeAdminIds } from "../notifications/service.js";
import { documentHash, renderDocumentHtml, type DocumentContent } from "./document.js";
import { integrations } from "./integrations.js";
import {
  FLOW_STEPS,
  MAX_WEEK,
  nextWindow,
  resolveWindow,
  stepStates,
  weekEndDate,
  weekOf,
  weekStartDate,
} from "./timeline.js";

/**
 * Course Change workflow engine (docs/course-change/DESIGN.md). Every status change runs in one
 * transaction together with its audit event(s) and notifications (CC-BR-9), and every
 * transition is a conditional UPDATE on the expected status, so two staff clicking Approve at
 * once cannot both win.
 */

/** "Today" for routing — overridable for demos/tests via COURSE_CHANGE_TODAY. */
export const ccToday = (): string => config.COURSE_CHANGE_TODAY ?? todayISO();

const TYPE_TH: Record<CourseChangeType, string> = { drop: "ลด", withdraw: "ถอน" };

interface Snapshot {
  studentName: string;
  studentNo: string;
  courseCode: string;
  courseName: string;
  section: string | null;
  credits: number | null;
  advisorId: string | null;
  advisorName: string | null;
  termLabel: string;
}

const displayName = (u: { titlePrefix: string | null; name: string }) =>
  [u.titlePrefix, u.name].filter(Boolean).join(" ");

/** Academic year in the Buddhist era, as printed on Chula forms: 2026 → 2569. */
const termLabel = (t: { academicYear: number; termNumber: number }) =>
  `ภาคการศึกษาที่ ${t.termNumber}/${t.academicYear + 543}`;

// ------------------------------------------------------------------- context

export async function loadContext(today: string, tx: Tx = prisma) {
  const term = await tx.term.findFirst({
    where: { isActive: true },
    include: { courseChangeWindows: { orderBy: [{ requestType: "asc" }, { weekFrom: "asc" }] } },
  });

  if (!term) {
    return {
      today,
      simulated: !!config.COURSE_CHANGE_TODAY,
      term: null,
      week: 0,
      maxWeek: MAX_WEEK,
      windows: [],
      open: { drop: null, withdraw: null },
      next: { drop: null, withdraw: null },
      rules: [],
    };
  }

  const start = isoDate(term.startDate);
  const week = weekOf(start, today);
  const rules = term.courseChangeWindows;

  const windowView = (w: (typeof rules)[number]) => ({
    requestType: w.requestType,
    flow: w.flow,
    weekFrom: w.weekFrom,
    weekTo: w.weekTo,
    opensOn: weekStartDate(start, w.weekFrom),
    closesOn: weekEndDate(start, w.weekTo),
    isOpen: week >= w.weekFrom && week <= w.weekTo,
  });

  const openFor = (type: CourseChangeType) => {
    const w = resolveWindow(rules, type, week);
    return w ? windowView(w) : null;
  };
  const nextFor = (type: CourseChangeType) => {
    const w = nextWindow(rules, type, week);
    return w ? windowView(w) : null;
  };

  return {
    today,
    simulated: !!config.COURSE_CHANGE_TODAY,
    term: {
      id: term.id,
      label: termLabel(term),
      startDate: start,
      endDate: isoDate(term.endDate),
    },
    week,
    maxWeek: MAX_WEEK,
    windows: rules.map(windowView),
    open: { drop: openFor("drop"), withdraw: openFor("withdraw") },
    next: { drop: nextFor("drop"), withdraw: nextFor("withdraw") },
    rules,
  };
}

export async function getContext(today: string) {
  const { rules: _rules, ...ctx } = await loadContext(today);
  // The step list per flow, so the form can preview the route before anything is submitted.
  return { ...ctx, flowSteps: FLOW_STEPS };
}

// --------------------------------------------------------- eligible courses

const LIVE: CourseChangeStatus[] = ["pending_approval", "processing", "completed"];

/**
 * The student's enrolled CEDT-catalog courses, each flagged with whether `type` can be requested
 * (CC-BR-1/2/4/11). Courses without a catalog source (LabSync booking courses such as the legacy
 * CEDT101 placeholders) are not Course Change courses and are left out entirely.
 */
export async function eligibleCourses(me: SessionUser, type: CourseChangeType, today: string) {
  const ctx = await loadContext(today);
  if (!ctx.term) return { items: [] };
  const schedules = await prisma.courseChangeSchedule.findMany({ where: { termId: ctx.term.id, published: true }, orderBy: { opensOn: "asc" } });

  const [enrollments, allowed, live] = await Promise.all([
    prisma.enrollment.findMany({
      where: { studentId: me.id, termId: ctx.term.id, course: { catalogSource: { not: null } } },
      include: { course: true },
      orderBy: { course: { code: "asc" } },
    }),
    prisma.allowedCourse.findMany({ where: { termId: ctx.term.id } }),
    prisma.courseChangeRequest.findMany({
      where: { studentId: me.id, termId: ctx.term.id, status: { in: LIVE } },
      select: { courseId: true, requestNo: true, requestType: true },
    }),
  ]);

  const allowedBy = new Map(allowed.map((a) => [a.courseId, a]));
  const liveBy = new Map(live.map((r) => [r.courseId, r]));

  return {
    items: enrollments.map((e) => {
      const a = allowedBy.get(e.courseId);
      const existing = liveBy.get(e.courseId);
      const rows = matchingSchedules(schedules, e.courseId, e.section, type);
      const active = rows.find(s => today >= isoDate(s.opensOn) && today <= isoDate(s.closesOn));
      const schedule = active ?? rows.find(s => isoDate(s.opensOn) > today) ?? rows.at(-1);
      const window = schedule ? windowView(schedule, today, ctx.term!.startDate) : null;
      let blockedReason: string | null = null;
      if (existing) {
        blockedReason = `มีคำร้อง${TYPE_TH[existing.requestType]}รายวิชานี้แล้ว (${existing.requestNo})`;
      } else if (!e.course.isActive) {
        blockedReason = "รายวิชานี้ถูกปิดใช้งานในระบบ";
      } else if (!a || !(type === "drop" ? a.allowDrop : a.allowWithdraw)) {
        blockedReason = a?.note ?? `หลักสูตรไม่ได้เปิดให้${TYPE_TH[type]}รายวิชานี้`;
      } else if (!schedule) {
        blockedReason = "หลักสูตรยังไม่ได้ประกาศกำหนดรับคำร้องรายวิชา/ตอนเรียนนี้";
      } else if (!active) {
        blockedReason = today < isoDate(schedule.opensOn) ? `เปิดรับ ${isoDate(schedule.opensOn)}` : `หมดเขตรับคำร้อง ${isoDate(schedule.closesOn)}`;
      }
      return {
        courseId: e.courseId,
        courseCode: e.course.code,
        courseName: e.course.name,
        section: e.section,
        credits: e.credits,
        window, scheduleLabel: schedule?.label ?? null, courseFormat: schedule?.format ?? null,
        enrollmentSource: e.source,
        eligible: blockedReason === null,
        blockedReason,
        announcement: a?.note ?? null,
      };
    }),
  };
}

// ------------------------------------------------------------- notifications

export async function notifyCc(
  tx: Tx,
  args: { userIds: string[]; type: NotificationType; message: string; requestId: string; requestNo: string },
): Promise<void> {
  const recipients = [...new Set(args.userIds)];
  if (recipients.length === 0) return;

  // Historical requests use the LINE mock; v2 records only real in-app delivery.
  const request = await tx.courseChangeRequest.findUniqueOrThrow({ where: { id: args.requestId }, select: { workflowVersion: true } });
  const students = new Set(
    (
      await tx.user.findMany({
        where: { id: { in: recipients }, role: "student" },
        select: { id: true },
      })
    ).map((u) => u.id),
  );
  const now = new Date();
  if (request.workflowVersion === 1) for (const id of students) await integrations.line.push({ userId: id, message: args.message });

  await tx.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      type: args.type,
      message: args.message,
      courseChangeRequestId: args.requestId,
      payload: { requestNo: args.requestNo },
      deliveredLineAt: request.workflowVersion === 1 && students.has(userId) ? now : null,
    })),
  });
}

/** Who acts on a pending request: the student's advisor for Flow B, the programme (all staff) otherwise. */
export async function approverIds(tx: Tx, flow: CourseChangeFlow, snap: Snapshot): Promise<string[]> {
  if (flow === "advisor_pi" && snap.advisorId) return [snap.advisorId];
  return activeAdminIds(tx);
}

export const event = (
  tx: Tx,
  requestId: string,
  eventType: CourseChangeEventType,
  actorId: string | null,
  extra: { note?: string | null; payload?: Prisma.InputJsonValue } = {},
) =>
  tx.courseChangeEvent.create({
    data: { requestId, eventType, actorId, note: extra.note ?? null, payload: extra.payload },
  });

export async function nextRequestNo(tx: Tx): Promise<string> {
  const rows = await tx.$queryRaw<{ request_no: string }[]>`
    SELECT 'CR-' || EXTRACT(year FROM now() AT TIME ZONE 'Asia/Bangkok')::int
           || '-' || lpad(nextval('course_change_request_seq')::text, 5, '0') AS request_no
  `;
  return rows[0]!.request_no;
}

// -------------------------------------------------------------------- submit

export interface SubmitInput {
  clientRequestId?: string;
  requestType: CourseChangeType;
  courseId: string;
  reason: string;
  routePreview?: { termId: string; flow: CourseChangeFlow; opensOn: string; closesOn: string; scheduleId?: string; scheduleRevision?: number };
}

export async function submitLegacyRequest(input: SubmitInput, me: SessionUser, today: string) {
  const id = await prisma.$transaction(async (tx) => {
    if (input.clientRequestId) {
      // Serialize identical retries before reading: only the first may create events/notifications.
      const scope = `${me.id}:${input.clientRequestId}`;
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${scope}, 0))`;
      const previous = await tx.courseChangeRequest.findUnique({
        where: { studentId_clientRequestId: { studentId: me.id, clientRequestId: input.clientRequestId } },
      });
      if (previous) {
        if (previous.requestType !== input.requestType || previous.courseId !== input.courseId ||
          previous.reason !== input.reason || (input.routePreview && previous.termId !== input.routePreview.termId)) {
          throw conflict("ข้อมูลของการยื่นครั้งนี้เปลี่ยนแล้ว กรุณาตรวจสอบคำร้องเดิมก่อนเริ่มรายการใหม่");
        }
        return previous.id;
      }
    }
    const ctx = await loadContext(today, tx);
    if (!ctx.term) throw windowClosed("ยังไม่มีภาคการศึกษาที่เปิดอยู่");

    // CC-BR-3/4: the server decides the route from today's week; the UI only previews it.
    const window = resolveWindow(ctx.rules, input.requestType, ctx.week);
    if (!window) {
      throw windowClosed(
        `ไม่อยู่ในช่วงเวลา${TYPE_TH[input.requestType]}รายวิชา (สัปดาห์ที่ ${ctx.week})`,
      );
    }
    const preview = input.routePreview;
    if (preview && (preview.termId !== ctx.term.id || preview.flow !== window.flow ||
      preview.opensOn !== weekStartDate(ctx.term.startDate, window.weekFrom) ||
      preview.closesOn !== weekEndDate(ctx.term.startDate, window.weekTo))) {
      throw conflict("ช่วงเวลาหรือเส้นทางคำร้องเปลี่ยนแล้ว กรุณาตรวจสอบและยืนยันอีกครั้ง");
    }

    // CC-BR-1: enrolled AND announced as droppable/withdrawable.
    const enrollment = await tx.enrollment.findUnique({
      where: {
        studentId_termId_courseId: { studentId: me.id, termId: ctx.term.id, courseId: input.courseId },
      },
      include: { course: true },
    });
    if (!enrollment) {
      throw validation("ไม่พบรายวิชานี้ในรายการลงทะเบียนของคุณ", [
        { field: "courseId", message: "not enrolled" },
      ]);
    }
    // CC-BR-11: only active courses from the CEDT catalog take part in Course Change.
    if (!enrollment.course.catalogSource) {
      throw validation("รายวิชานี้ไม่อยู่ในรายการรายวิชาของหลักสูตร", [
        { field: "courseId", message: "not in the CEDT course catalog" },
      ]);
    }
    if (!enrollment.course.isActive) {
      throw validation("รายวิชานี้ถูกปิดใช้งานในระบบ", [
        { field: "courseId", message: "course is inactive" },
      ]);
    }
    const allowed = await tx.allowedCourse.findUnique({
      where: { termId_courseId: { termId: ctx.term.id, courseId: input.courseId } },
    });
    if (!allowed || !(input.requestType === "drop" ? allowed.allowDrop : allowed.allowWithdraw)) {
      throw validation(`หลักสูตรไม่ได้เปิดให้${TYPE_TH[input.requestType]}รายวิชานี้`, [
        { field: "courseId", message: "not in the allowed-course list" },
      ]);
    }

    // CC-BR-2 (app-level; the one_live_course_change partial index is the DB backstop).
    const live = await tx.courseChangeRequest.findFirst({
      where: { studentId: me.id, termId: ctx.term.id, courseId: input.courseId, status: { in: LIVE } },
    });
    if (live) throw conflict(`มีคำร้องสำหรับรายวิชานี้อยู่แล้ว (${live.requestNo})`);

    const student = await tx.user.findUniqueOrThrow({
      where: { id: me.id },
      include: { advisor: true },
    });

    const snapshot: Snapshot = {
      studentName: displayName(student),
      studentNo: student.studentNo ?? "",
      courseCode: enrollment.course.code,
      courseName: enrollment.course.name,
      section: enrollment.section,
      credits: enrollment.credits,
      advisorId: student.advisor?.id ?? null,
      advisorName: student.advisor ? displayName(student.advisor) : null,
      termLabel: ctx.term.label,
    };

    const flow = window.flow;
    const req = await tx.courseChangeRequest.create({
      data: {
        clientRequestId: input.clientRequestId,
        requestNo: await nextRequestNo(tx),
        studentId: me.id,
        termId: ctx.term.id,
        courseId: input.courseId,
        requestType: input.requestType,
        flow,
        weekNo: ctx.week,
        // Flow A needs no human approval — it goes straight out to Reg Chula.
        status: flow === "reg_direct" ? "processing" : "pending_approval",
        reason: input.reason,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    });
    await event(tx, req.id, "submitted", me.id, {
      payload: { week: ctx.week, flow },
    });

    const subject = `${TYPE_TH[input.requestType]} ${snapshot.courseCode}`;

    if (flow === "reg_direct") {
      const { ref } = await integrations.regChula.submitIntent({
        requestNo: req.requestNo,
        studentNo: snapshot.studentNo,
        courseCode: snapshot.courseCode,
        section: snapshot.section,
        requestType: input.requestType,
      });
      await tx.courseChangeRequest.update({ where: { id: req.id }, data: { regChulaRef: ref } });
      await event(tx, req.id, "sent_to_reg_chula", null, { payload: { ref } });
      await notifyCc(tx, {
        userIds: [me.id],
        type: "cc_submitted",
        message: `${req.requestNo} ${subject} จำลองส่งเข้า Reg Chula แล้ว — รอเจ้าหน้าที่บันทึกผล`,
        requestId: req.id,
        requestNo: req.requestNo,
      });
    } else {
      await notifyCc(tx, {
        userIds: await approverIds(tx, flow, snapshot),
        type: "cc_submitted",
        message: `${snapshot.studentName} ยื่นคำร้อง${subject} (${req.requestNo}) — รออนุมัติ`,
        requestId: req.id,
        requestNo: req.requestNo,
      });
    }

    return req.id;
  });

  return getRequest(id, me);
}

/** A read-only recovery check never creates a request or discloses another student's submission. */
export async function recoverSubmission(clientRequestId: string, me: SessionUser) {
  const previous = await prisma.courseChangeRequest.findUnique({
    where: { studentId_clientRequestId: { studentId: me.id, clientRequestId } },
    select: { id: true },
  });
  return previous ? getRequest(previous.id, me) : null;
}

// ----------------------------------------------------------------- read side

type RequestRow = Prisma.CourseChangeRequestGetPayload<{
  include: { decidedBy: true; events: { select: { payload: true; createdAt: true } } };
}>;

function serialize(r: RequestRow) {
  const snap = r.snapshot as unknown as Snapshot;
  return {
    ...phaseTiming(r),
    id: r.id,
    requestNo: r.requestNo,
    requestType: r.requestType,
    flow: r.flow,
    weekNo: r.weekNo,
    status: r.status,
    workflowVersion: r.workflowVersion, phase: r.phase, workflowPlan: r.workflowPlan, revision: r.revision,
    reason: r.reason,
    rejectReason: r.rejectReason,
    studentId: r.studentId,
    studentName: snap.studentName,
    studentNo: snap.studentNo,
    advisorName: snap.advisorName,
    courseId: r.courseId,
    courseCode: snap.courseCode,
    courseName: snap.courseName,
    section: snap.section,
    credits: snap.credits,
    termLabel: snap.termLabel,
    decidedByName: r.decidedBy ? displayName(r.decidedBy) : null,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    hasDocument: r.documentHash !== null,
    documentHash: r.documentHash,
    regChulaRef: r.regChulaRef,
    piRef: r.piRef,
    completedAt: r.completedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export interface ListQuery {
  phase?: string;
  section?: string;
  status?: CourseChangeStatus | "done";
  type?: CourseChangeType;
  search?: string;
  page?: number;
  pageSize?: number;
  courseId?: string;
  termId?: string;
}

function requestScope(q: ListQuery, me: SessionUser): Prisma.CourseChangeRequestWhereInput {
  const scope: Prisma.CourseChangeRequestWhereInput =
    me.role === "student" ? { studentId: me.id } : {};
  const search = q.search?.trim();
  return {
    ...scope,
    ...(q.phase ? { phase: q.phase } : {}),
    ...(q.section ? { snapshot: { path: ["section"], equals: q.section } } : {}),
    ...(q.type ? { requestType: q.type } : {}),
    ...(q.courseId ? { courseId: q.courseId } : {}),
    ...(q.termId ? { termId: q.termId } : {}),
    ...(search ? { OR: [
      { requestNo: { contains: search, mode: "insensitive" } },
      { student: { name: { contains: search, mode: "insensitive" } } },
      { student: { studentNo: { contains: search, mode: "insensitive" } } },
      { course: { code: { contains: search, mode: "insensitive" } } },
      { course: { name: { contains: search, mode: "insensitive" } } },
    ] } : {}),
  };
}

function requestStatus(status: ListQuery["status"]): Prisma.CourseChangeRequestWhereInput {
  return status ? { status: status === "done" ? { in: ["completed", "rejected", "cancelled"] } : status } : {};
}

/** CC-BR-10: students see their own requests only; staff see everything. */
export async function listRequests(q: ListQuery, me: SessionUser) {
  const scopeWithFilters = requestScope(q, me);
  const where: Prisma.CourseChangeRequestWhereInput = {
    ...scopeWithFilters,
    ...requestStatus(q.status),
  };
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 25;

  const [rows, grouped, total] = await prisma.$transaction([
    prisma.courseChangeRequest.findMany({
      where,
      include: { decidedBy: true, events: {select:{payload:true,createdAt:true},orderBy:[{createdAt:"asc"},{id:"asc"}]} },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.courseChangeRequest.groupBy({
      by: ["status"],
      orderBy: { status: "asc" },
      where: scopeWithFilters,
      _count: true,
    }),
    prisma.courseChangeRequest.count({ where }),
  ]);

  const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count])) as Partial<
    Record<CourseChangeStatus, number>
  >;
  return { items: rows.map(serialize), counts,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}

/** Full-dataset course/term grouping, independent of the inbox's current page. */
export async function requestGroups(q: ListQuery, me: SessionUser) {
  const groups = await prisma.courseChangeRequest.groupBy({
    by: ["termId", "courseId"],
    orderBy: [{ termId: "asc" }, { courseId: "asc" }],
    where: { ...requestScope(q, me), ...requestStatus(q.status) },
    _count: { _all: true },
  });
  const [courses, terms] = await Promise.all([
    prisma.course.findMany({ where: { id: { in: groups.map((g) => g.courseId) } } }),
    prisma.term.findMany({ where: { id: { in: groups.map((g) => g.termId) } } }),
  ]);
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const termById = new Map(terms.map((t) => [t.id, t]));
  return { items: groups.map((g) => ({ termId: g.termId, courseId: g.courseId,
    courseCode: courseById.get(g.courseId)!.code, courseName: courseById.get(g.courseId)!.name,
    termLabel: termLabel(termById.get(g.termId)!), count: g._count._all,
  })).sort((a, b) => b.termLabel.localeCompare(a.termLabel) || a.courseCode.localeCompare(b.courseCode)) };
}

export async function loadVisible(id: string, me: SessionUser, tx: Tx = prisma) {
  const r = await tx.courseChangeRequest.findUnique({
    where: { id },
    include: {
      decidedBy: true,
      events: { include: { actor: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    },
  });
  // 404 (not 403) for someone else's request, so request ids cannot be probed.
  if (!r || (me.role === "student" && r.studentId !== me.id)) throw notFound("ไม่พบคำร้อง");
  return r;
}

export async function getRequest(id: string, me: SessionUser) {
  const r = await loadVisible(id, me);
  return {
    ...serialize(r),
    files: await prisma.courseChangeFile.findMany({ where: { requestId: id, ...(me.role === "student" ? { OR: [{ kind: {not: "signed_petition"} }, { id: {in: r.events.flatMap(e => (e.payload as {releasedFileIds?: string[]} | null)?.releasedFileIds ?? [])} }] } : {}) }, select: { id: true, kind: true, filename: true, sha256: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    steps: r.workflowVersion === 2 ? workflowStepViews(r) : stepStates(r.flow, r.status, r.events),
    events: r.events.map((e) => ({
      id: e.id.toString(),
      eventType: e.eventType,
      actorName: e.actor ? displayName(e.actor) : "ระบบ",
      note: e.note,
      payload: e.payload,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

// --------------------------------------------------------------- transitions

/** Conditional status flip — the row only moves if it is still in `from` (no double approval). */
async function transition(
  tx: Tx,
  id: string,
  from: CourseChangeStatus,
  data: Prisma.CourseChangeRequestUncheckedUpdateManyInput,
  extraWhere: Prisma.CourseChangeRequestWhereInput = {},
) {
  const { count } = await tx.courseChangeRequest.updateMany({
    where: { id, status: from, ...extraWhere },
    data,
  });
  if (count === 0) {
    const current = await tx.courseChangeRequest.findUnique({ where: { id } });
    if (!current) throw notFound("ไม่พบคำร้อง");
    throw invalidTransition(`คำร้องนี้อยู่ในสถานะ ${current.status} แล้ว`);
  }
  return tx.courseChangeRequest.findUniqueOrThrow({ where: { id } });
}

function documentContent(
  r: { requestNo: string; requestType: CourseChangeType; weekNo: number; reason: string; createdAt: Date; snapshot: Prisma.JsonValue },
  approverName: string,
  approvedAt: Date,
): DocumentContent {
  const snap = r.snapshot as unknown as Snapshot;
  return {
    requestNo: r.requestNo,
    requestType: r.requestType,
    termLabel: snap.termLabel,
    weekNo: r.weekNo,
    studentName: snap.studentName,
    studentNo: snap.studentNo,
    courseCode: snap.courseCode,
    courseName: snap.courseName,
    section: snap.section,
    credits: snap.credits,
    reason: r.reason,
    submittedAt: r.createdAt.toISOString(),
    approverName,
    approvedAt: approvedAt.toISOString(),
  };
}

export async function approveRequest(id: string, me: SessionUser) {
  const existing = await loadVisible(id, me);
  if (existing.workflowVersion === 2) throw conflict("คำร้องรุ่นใหม่ต้องใช้ขั้นตรวจคำร้อง ไม่ใช่การอนุมัติแบบเดิม");
  await prisma.$transaction(async (tx) => {
    const now = new Date();
    const r = await transition(tx, id, "pending_approval", {
      status: "processing",
      decidedById: me.id,
      decidedAt: now,
    });
    const snap = r.snapshot as unknown as Snapshot;
    await event(tx, id, "approved", me.id);

    if (r.flow === "advisor_pi") {
      // CC-BR-7: build + seal the merged petition, then hand it to Reg Chula and PI.
      const approverName = displayName(me);
      const hash = documentHash(documentContent(r, approverName, now));
      await event(tx, id, "document_generated", null, { payload: { sha256: hash, approverName } });

      const reg = await integrations.regChula.submitIntent({
        requestNo: r.requestNo,
        studentNo: snap.studentNo,
        courseCode: snap.courseCode,
        section: snap.section,
        requestType: r.requestType,
      });
      await event(tx, id, "sent_to_reg_chula", null, { payload: { ref: reg.ref } });

      const pi = await integrations.piSystem.uploadPetition({
        requestNo: r.requestNo,
        studentNo: snap.studentNo,
        documentHash: hash,
      });
      await event(tx, id, "sent_to_pi", null, { payload: { ref: pi.ref } });

      await tx.courseChangeRequest.update({
        where: { id },
        data: {
          documentHash: hash,
          documentGeneratedAt: now,
          regChulaRef: reg.ref,
          piRef: pi.ref,
        },
      });
    } else if (r.flow === "program_registrar") {
      await event(tx, id, "forwarded_to_registrar", me.id, { note: "รวบรวมส่ง สนท." });
    }

    await notifyCc(tx, {
      userIds: [r.studentId],
      type: "cc_approved",
      message: `${r.requestNo} ${TYPE_TH[r.requestType]} ${snap.courseCode} ได้รับการอนุมัติแล้ว — ระบบบันทึกการส่งต่อแบบจำลอง`,
      requestId: id,
      requestNo: r.requestNo,
    });
  });

  return getRequest(id, me);
}

export async function bulkApprove(ids: string[], me: SessionUser) {
  const results: { id: string; ok: boolean; message?: string }[] = [];
  // One transaction per request: a single stale row must not roll back the others.
  for (const id of ids) {
    try {
      await approveRequest(id, me);
      results.push({ id, ok: true });
    } catch (e) {
      results.push({ id, ok: false, message: e instanceof Error ? e.message : "error" });
    }
  }
  return { results };
}

export async function rejectRequest(id: string, reason: string, me: SessionUser) {
  const existing = await loadVisible(id, me);
  if (existing.workflowVersion === 2) throw conflict("คำร้องรุ่นใหม่ต้องบันทึกเหตุผลผ่านขั้นตรวจคำร้องพร้อมรุ่นข้อมูลล่าสุด");
  await prisma.$transaction(async (tx) => {
    const r = await transition(tx, id, "pending_approval", {
      status: "rejected",
      decidedById: me.id,
      decidedAt: new Date(),
      rejectReason: reason,
    });
    const snap = r.snapshot as unknown as Snapshot;
    await event(tx, id, "rejected", me.id, { note: reason });
    await notifyCc(tx, {
      userIds: [r.studentId],
      type: "cc_rejected",
      message: `${r.requestNo} ${TYPE_TH[r.requestType]} ${snap.courseCode} ไม่ได้รับการอนุมัติ: ${reason}`,
      requestId: id,
      requestNo: r.requestNo,
    });
  });
  return getRequest(id, me);
}

/** CC-BR-5: only the owner, only while nobody has decided yet. */
export async function cancelRequest(id: string, me: SessionUser) {
  await loadVisible(id, me);
  await prisma.$transaction(async (tx) => {
    const r = await transition(tx, id, "pending_approval", { status: "cancelled" }, {
      studentId: me.id,
    });
    const snap = r.snapshot as unknown as Snapshot;
    await event(tx, id, "cancelled", me.id);
    await notifyCc(tx, {
      userIds: await approverIds(tx, r.flow, snap),
      type: "cc_cancelled",
      message: `${snap.studentName} ยกเลิกคำร้อง ${r.requestNo} (${TYPE_TH[r.requestType]} ${snap.courseCode})`,
      requestId: id,
      requestNo: r.requestNo,
    });
  });
  return getRequest(id, me);
}

/**
 * CC-BR-8: record the registry's final answer. Staff enter it in the prototype; in production
 * this is the Reg Chula webhook / polling job.
 */
export async function completeRequest(id: string, note: string | null, me: SessionUser) {
  const existing = await loadVisible(id, me);
  if (existing.workflowVersion === 2) throw conflict("คำร้องรุ่นใหม่ต้องตรวจเอกสารและบันทึกหลักฐานผลทะเบียนก่อน");
  await prisma.$transaction(async (tx) => {
    const r = await transition(tx, id, "processing", { status: "completed", completedAt: new Date() });
    const snap = r.snapshot as unknown as Snapshot;
    await event(tx, id, "completed", me.id, { note });
    await notifyCc(tx, {
      userIds: [r.studentId],
      type: "cc_completed",
      message: `${r.requestNo} ${TYPE_TH[r.requestType]} ${snap.courseCode} ดำเนินการสำเร็จ — เจ้าหน้าที่บันทึกผลในระบบสาธิตแล้ว`,
      requestId: id,
      requestNo: r.requestNo,
    });
  });
  return getRequest(id, me);
}

// ------------------------------------------------------------------ document

export async function getDocumentHtml(id: string, me: SessionUser): Promise<string> {
  const r = await loadVisible(id, me);
  const generated = r.events.find((e) => e.eventType === "document_generated");
  if (!r.documentHash || !r.decidedAt || !generated) {
    throw notFound("คำร้องนี้ยังไม่มีเอกสาร");
  }
  // Re-derive the content from the stored record and let the renderer verify it against the
  // hash sealed at approval time. The signer's name is the one captured when they signed.
  const { approverName } = generated.payload as { approverName: string };
  return renderDocumentHtml(documentContent(r, approverName, r.decidedAt), r.documentHash);
}
