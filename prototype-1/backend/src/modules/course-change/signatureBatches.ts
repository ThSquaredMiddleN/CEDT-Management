import { createHash } from "node:crypto";
import { z } from "zod";
import type { Prisma, CourseChangeSignatureBatch } from "@prisma/client";
import { prisma } from "../../db.js";
import { conflict, notFound, validation } from "../../lib/errors.js";
import { isoDate } from "../../lib/time.js";
import type { SessionUser } from "../../plugins/auth.js";
import { ccToday, event, notifyCc } from "./service.js";
import { lockedRequest, type Plan } from "./workflow.js";
export const signatureBatchSchema = z
  .object({
    id: z.string().uuid(),
    items: z
      .array(
        z.object({
          id: z.string().uuid(),
          revision: z.number().int().nonnegative(),
        }),
      )
      .min(1)
      .max(50),
    recipient: z.string().trim().min(3).max(200),
    sentOn: z.string().date(),
    note: z.string().trim().min(5).max(1000),
  })
  .superRefine((v, ctx) => {
    if (new Set(v.items.map((i) => i.id)).size !== v.items.length)
      ctx.addIssue({ code: "custom", message: "มีคำร้องซ้ำในชุด" });
  });
const view = (batch: CourseChangeSignatureBatch) => ({
  ...batch,
  payloadHash: undefined,
  sentOn: isoDate(batch.sentOn),
  createdAt: batch.createdAt.toISOString(),
});
async function withProgress(rows: CourseChangeSignatureBatch[]) {
  const ids = rows.flatMap((row) =>
    (row.summary as { id: string }[]).map((item) => item.id),
  );
  const requests = await prisma.courseChangeRequest.findMany({
    where: { id: { in: ids } },
    select: { id: true, phase: true, status: true },
  });
  const byId = new Map(requests.map((r) => [r.id, r]));
  return rows.map((row) => {
    const members = (row.summary as { id: string }[]).map((item) =>
      byId.get(item.id),
    );
    return {
      ...view(row),
      pendingCount: members.filter(
        (r) => r?.phase === "awaiting_signature" && r.status === "processing",
      ).length,
      returnedCount: members.filter(
        (r) =>
          r &&
          [
            "student_external",
            "ready_registrar",
            "awaiting_result",
            "completed",
          ].includes(r.phase ?? ""),
      ).length,
    };
  });
}
export async function signatureBatches() {
  const term = await prisma.term.findFirst({ where: { isActive: true } });
  return {
    items: term
      ? await withProgress(
          await prisma.courseChangeSignatureBatch.findMany({
            where: { termId: term.id },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 20,
          }),
        )
      : [],
  };
}
export async function signatureBatch(id: string) {
  const row = await prisma.courseChangeSignatureBatch.findUnique({
    where: { id },
  });
  if (!row) throw notFound("ไม่พบชุดขอลงนาม");
  return (await withProgress([row]))[0]!;
}
export async function createSignatureBatch(
  input: z.infer<typeof signatureBatchSchema>,
  me: SessionUser,
) {
  const sorted = [...input.items].sort((a, b) => a.id.localeCompare(b.id));
  const hash = createHash("sha256")
    .update(JSON.stringify({ ...input, actorId: me.id, items: sorted }))
    .digest("hex");
  await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`signature-batch:${input.id}`},0))`;
      const previous = await tx.courseChangeSignatureBatch.findUnique({
        where: { id: input.id },
      });
      if (previous) {
        if (previous.payloadHash !== hash)
          throw conflict(
            "ข้อมูลชุดนี้เปลี่ยนแล้ว กรุณาตรวจชุดที่บันทึกไปก่อน ไม่ใช้รหัสเดิมกับข้อมูลใหม่",
          );
        return;
      }
      if (input.sentOn > ccToday())
        throw validation("วันส่งขอลงนามต้องไม่เป็นวันในอนาคต");
      const rows = [];
      for (const item of sorted) {
        const row = await lockedRequest(tx, item.id, item.revision, me);
        if (
          row.phase !== "awaiting_signature" ||
          !(row.workflowPlan as unknown as Plan).needsSignature
        )
          throw conflict(`${row.requestNo} ไม่อยู่ในขั้นรอลงนาม`);
        rows.push(row);
      }
      const first = rows[0]!;
      const grouping = (r: typeof first) =>
        JSON.stringify([
          r.termId,
          r.courseId,
          r.requestType,
          (r.snapshot as { section?: string }).section,
          (r.workflowPlan as unknown as Plan).scheduleId,
        ]);
      if (rows.some((r) => grouping(r) !== grouping(first)))
        throw validation(
          "รวบรวมเฉพาะวิชา ตอนเรียน ประเภทคำร้อง และรอบประกาศเดียวกัน กรุณาแยกชุด",
        );
      const summary = rows.map((r) => ({
        id: r.id,
        requestNo: r.requestNo,
        requestType: r.requestType,
        reason: r.reason,
        ...(r.snapshot as Prisma.JsonObject),
        scheduleLabel: (r.workflowPlan as unknown as Plan).label,
      }));
      await tx.courseChangeSignatureBatch.create({
        data: {
          id: input.id,
          termId: first.termId,
          courseId: first.courseId,
          actorId: me.id,
          recipient: input.recipient,
          sentOn: new Date(input.sentOn),
          note: input.note,
          payloadHash: hash,
          summary: summary as Prisma.InputJsonValue,
        },
      });
      for (const r of rows) {
        await tx.courseChangeRequest.update({
          where: { id: r.id },
          data: { revision: { increment: 1 } },
        });
        await event(tx, r.id, "workflow_updated", me.id, {
          note: `บันทึกส่งขอลงนามเป็นชุดให้ ${input.recipient} วันที่ ${input.sentOn} · ${input.note}`,
          payload: {
            action: "signature_sent",
            batchId: input.id,
            recipient: input.recipient,
            sentOn: input.sentOn,
            phase: r.phase,
            previousPhase: r.phase,
          },
        });
        await notifyCc(tx, {
          userIds: [r.studentId],
          type: "cc_approved",
          message: `${r.requestNo} · เจ้าหน้าที่บันทึกส่งขอลงนามแล้ว ยังรอเอกสารลงนามคืน`,
          requestId: r.id,
          requestNo: r.requestNo,
        });
      }
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
  return signatureBatch(input.id);
}
