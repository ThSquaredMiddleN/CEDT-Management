import { z } from "zod";

export const announcementAudienceSchema = z.enum(["all", "year1", "year2", "year3", "year4"]);

export const announcementCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().max(200_000),
  audiences: z
    .array(announcementAudienceSchema)
    .min(1)
    .max(5)
    .refine((values) => new Set(values).size === values.length),
});

export const announcementUpdateSchema = announcementCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field must be provided",
);

export const announcementIdSchema = z.object({ id: z.string().uuid() });

export type AnnouncementCreateInput = z.infer<typeof announcementCreateSchema>;
export type AnnouncementUpdateInput = z.infer<typeof announcementUpdateSchema>;
