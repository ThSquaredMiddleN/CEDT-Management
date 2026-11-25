import { z } from "zod";

const studentNo = z.string().regex(/^\d{10}$/, "รหัสนิสิตต้องเป็นตัวเลข 10 หลัก");

export const idParam = z.object({ id: z.string().min(1).max(40) });
export const studentNoParam = z.object({ studentNo });

const issueLine = z.object({ itemId: z.string().min(1).max(40), qty: z.number().int().min(0), sns: z.array(z.string().max(60)).max(200) });

export const createRequestBody = z.object({
  groupId: z.string().min(1).max(40),
  items: z.array(z.object({ itemId: z.string().min(1).max(40), qty: z.number().int() })).max(50),
});
export const issueBody = z.object({
  lines: z.array(issueLine).max(50),
  pickup: z.object({
    pickupAt: z.iso.datetime({ offset: true }),
    location: z.enum(["locker", "counter", "lab"]),
    remark: z.string().max(500).default(""),
  }),
});
export const rejectBody = z.object({ reason: z.string().trim().min(1, "กรุณาระบุเหตุผลที่ปฏิเสธ").max(500) });
const epochMs = z.number().int().min(0).max(253402300799999); // end of year 9999
export const dueBody = z.object({ dueAt: epochMs });
export const settingsDueBody = z.object({ defaultDueAt: epochMs });
export const addItemBody = z.object({
  id: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(200),
  isUnique: z.boolean(),
  total: z.number().int().min(1).max(10_000),
});
export const walkInBody = z.object({ studentId: studentNo, groupId: z.string().min(1).max(40), lines: z.array(issueLine).max(50) });

const counts = z.object({ RETURNED: z.number().int(), NOT_BROUGHT: z.number().int(), LOST: z.number().int() });
export const returnBody = z.object({
  studentId: studentNo,
  results: z.record(z.string().max(40), counts).refine((r) => Object.keys(r).length <= 200, "รายการมากเกินไป"),
  remark: z.string().max(1000).default(""),
  fine: z.object({ amount: z.number().int().min(0), remark: z.string().max(500) }).optional(),
});

const qcResults = z.object({ AVAILABLE: z.number().int(), DAMAGED: z.number().int(), LOST: z.number().int() });
export const qcSubmitBody = z.object({
  items: z.array(z.object({ id: z.string().min(1).max(40), results: qcResults })).max(200),
  fineAmount: z.number().int().min(0),
  fineRemark: z.string().max(500).default(""),
});
export const verifyBody = z.object({ valid: z.boolean() });
