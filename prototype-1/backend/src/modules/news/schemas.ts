import { z } from "zod";
import { badRequest } from "../../lib/errors.js";

export const NEWS_TAGS = [
  "competition",
  "activities",
  "scholarship",
  "internship",
  "academic",
  "other",
] as const;

export const newsTagSchema = z.enum(NEWS_TAGS);

export const newsFieldsSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().max(200_000),
  tags: z
    .array(newsTagSchema)
    .max(NEWS_TAGS.length)
    .refine((values) => new Set(values).size === values.length),
});

export const newsUpdateSchema = newsFieldsSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field must be provided",
);

export const newsIdSchema = z.object({ id: z.string().uuid() });
export const newsImageIdSchema = z.object({
  id: z.string().uuid(),
  imageId: z.string().uuid(),
});

export type NewsFields = z.infer<typeof newsFieldsSchema>;
export type NewsUpdate = z.infer<typeof newsUpdateSchema>;

export function parseNewsMultipartFields(fields: Record<string, unknown>): NewsFields {
  let tags: unknown;
  try {
    tags = JSON.parse(String(fields.tags ?? "[]"));
  } catch {
    throw badRequest("Tags must be valid JSON");
  }

  return newsFieldsSchema.parse({
    title: fields.title,
    content: fields.content,
    tags,
  });
}
