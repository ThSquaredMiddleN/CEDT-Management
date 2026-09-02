import { z } from "zod";

export const HHMM = z
  .string()
  .regex(/^([01]\d|2[0-3]):(00|30)$/, "must be a 30-minute slot in HH:MM");

export const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

/** Shared by POST /bookings and POST /bookings/check-conflicts. */
export const bookingInputSchema = z
  .object({
    bookingType: z.enum(["recurring", "one_off"]),
    termId: z.string().uuid(),
    courseId: z.string().uuid().nullable().optional(),
    title: z.string().min(1).nullable().optional(),
    section: z.string().nullable().optional(),
    instructorId: z.string().uuid(),
    roomId: z.string().uuid(),
    dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
    startDate: ISO_DATE.nullable().optional(),
    endDate: ISO_DATE.nullable().optional(),
    oneOffDate: ISO_DATE.nullable().optional(),
    startTime: HHMM,
    endTime: HHMM,
    studentCount: z.number().int().min(1),
    note: z.string().nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.endTime <= v.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endTime"],
        message: "must be after startTime",
      });
    }
    // BR-20: a booking is either course-backed or a free-text "Other/Event" booking.
    if (!v.courseId && !v.title) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["title"],
        message: "title is required when no course is selected",
      });
    }
    if (v.bookingType === "recurring") {
      if (v.dayOfWeek === null || v.dayOfWeek === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dayOfWeek"],
          message: "required for a recurring booking",
        });
      }
      if (!v.startDate) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["startDate"], message: "required" });
      }
      if (!v.endDate) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "required" });
      }
      if (v.startDate && v.endDate && v.endDate < v.startDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endDate"],
          message: "must be on or after startDate",
        });
      }
    } else if (!v.oneOffDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["oneOffDate"], message: "required" });
    }
  });

export type BookingInput = z.infer<typeof bookingInputSchema>;

export const checkConflictsSchema = z.intersection(
  bookingInputSchema,
  z.object({ excludeBookingId: z.string().uuid().nullable().optional() }),
);

export const rejectSchema = z.object({
  reason: z.string().min(10, "must be at least 10 characters"),
});

export const cancelSchema = z.object({
  reason: z.string().nullable().optional(),
  occurrenceId: z.string().uuid().nullable().optional(),
});

export const patchBookingSchema = z.object({
  scope: z.enum(["occurrence", "series"]).optional(),
  occurrenceId: z.string().uuid().optional(),
  roomId: z.string().uuid().optional(),
  date: ISO_DATE.optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  startTime: HHMM.optional(),
  endTime: HHMM.optional(),
  section: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  studentCount: z.number().int().min(1).optional(),
});

export const listQuerySchema = z.object({
  // `mine=true` scopes the result to the caller's own requests (the "My Requests" page).
  mine: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  status: z.enum(["pending", "approved", "rejected", "cancelled"]).optional(),
  termId: z.string().uuid().optional(),
  instructorId: z.string().uuid().optional(),
  buildingId: z.string().uuid().optional(),
  sort: z.enum(["createdAt", "requestedDate"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
