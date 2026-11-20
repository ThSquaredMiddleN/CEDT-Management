import { z } from "zod";
import type {
  Announcement,
  AnnouncementInput,
  NewsArticle,
  NewsImage,
  NewsInput,
} from "@/api/types";
import { sanitizeAnnouncementHtml } from "@/features/announcements/announcement-utils";
import {
  DEMO_USER,
  DemoStorageError,
  deleteDemoNewsImage,
  demoValidation,
  getDemoNewsImage,
  getDemoSessionId,
  putDemoNewsImage,
  readDemoAnnouncements,
  readDemoNews,
  writeDemoAnnouncements,
  writeDemoNews,
} from "./demoMode";

class DemoApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "DemoApiError";
  }
}

const audiences = ["all", "year1", "year2", "year3", "year4"] as const;
const tags = demoValidation.tags;
const announcementInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().max(200_000),
  audiences: z.array(z.enum(audiences)).min(1).max(5)
    .refine((value) => new Set(value).size === value.length),
});
const announcementUpdateSchema = announcementInputSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
);
const newsInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().max(200_000),
  tags: z.array(z.enum(tags)).max(tags.length)
    .refine((value) => new Set(value).size === value.length),
});
const newsUpdateSchema = newsInputSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
);

function validationError(error: z.ZodError): DemoApiError {
  return new DemoApiError(422, "VALIDATION", error.issues[0]?.message ?? "Invalid input", error.issues);
}

function parseJsonBody(body: BodyInit | null | undefined): unknown {
  if (typeof body !== "string") return {};
  try {
    return JSON.parse(body);
  } catch {
    throw new DemoApiError(400, "BAD_REQUEST", "Request body must be valid JSON");
  }
}

function formString(form: FormData, key: string): string {
  const value = form.get(key);
  if (typeof value !== "string") {
    throw new DemoApiError(400, "BAD_REQUEST", `Missing form field: ${key}`);
  }
  return value;
}

function parseNewsForm(form: FormData): NewsInput {
  let parsedTags: unknown;
  try {
    parsedTags = JSON.parse(formString(form, "tags"));
  } catch (error) {
    if (error instanceof DemoApiError) throw error;
    throw new DemoApiError(400, "BAD_REQUEST", "Tags must be valid JSON");
  }
  const result = newsInputSchema.safeParse({
    title: formString(form, "title"),
    content: formString(form, "content"),
    tags: parsedTags,
  });
  if (!result.success) throw validationError(result.error);
  return result.data;
}

function parseAnnouncementInput(value: unknown): AnnouncementInput {
  const result = announcementInputSchema.safeParse(value);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

function parseAnnouncementUpdate(value: unknown): Partial<AnnouncementInput> {
  const result = announcementUpdateSchema.safeParse(value);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

function parseNewsUpdate(value: unknown): Partial<NewsInput> {
  const result = newsUpdateSchema.safeParse(value);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

function parseRequestBody(init: RequestInit): unknown {
  if (typeof FormData !== "undefined" && init.body instanceof FormData) return init.body;
  return parseJsonBody(init.body);
}

function notFound(kind: string): DemoApiError {
  return new DemoApiError(404, "NOT_FOUND", `${kind} not found`);
}

function makeAnnouncement(input: AnnouncementInput): Announcement {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    content: sanitizeAnnouncementHtml(input.content),
    audiences: input.audiences,
    status: "draft",
    authorId: DEMO_USER.id,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function makeNews(
  input: NewsInput,
  id = crypto.randomUUID(),
  images: NewsImage[] = [],
): NewsArticle {
  const now = new Date().toISOString();
  return {
    id,
    title: input.title.trim(),
    content: sanitizeAnnouncementHtml(input.content),
    tags: input.tags,
    status: "draft",
    authorId: DEMO_USER.id,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
    images,
  };
}

function getNewsFiles(form: FormData): File[] {
  return form.getAll("images").filter((value): value is File => value instanceof File);
}

function validateNewsFiles(files: File[], existingCount: number): void {
  if (existingCount + files.length > demoValidation.maxImages) {
    throw new DemoApiError(400, "BAD_REQUEST", "A news article can have at most 10 images");
  }
  if (
    files.some(
      (file) =>
        !["image/jpeg", "image/png"].includes(file.type) ||
        file.size === 0 ||
        file.size > demoValidation.maxImageBytes,
    )
  ) {
    throw new DemoApiError(
      400,
      "BAD_REQUEST",
      "Only non-empty JPG and PNG files up to 10 MB are supported",
    );
  }
}

async function saveNewsFiles(
  newsId: string,
  files: File[],
  position: number,
): Promise<NewsImage[]> {
  validateNewsFiles(files, position);
  const saved: NewsImage[] = [];
  try {
    for (const [index, file] of files.entries()) {
      const image: NewsImage = {
        id: crypto.randomUUID(),
        originalName: file.name.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 255) || "poster",
        mimeType: file.type,
        sizeBytes: file.size,
        position: position + index,
      };
      saved.push(image);
      await putDemoNewsImage(newsId, image.id, file);
    }
    return saved;
  } catch (error) {
    await Promise.all(saved.map((image) => deleteDemoNewsImage(newsId, image.id)));
    throw error;
  }
}

async function saveNewsCreate(form: FormData): Promise<{ news: NewsArticle }> {
  const input = parseNewsForm(form);
  const newsId = crypto.randomUUID();
  const files = getNewsFiles(form);
  const images = await saveNewsFiles(newsId, files, 0);
  const news = makeNews(input, newsId, images);
  try {
    await writeDemoNews([news, ...(await readDemoNews())]);
  } catch (error) {
    await Promise.all(images.map((image) => deleteDemoNewsImage(newsId, image.id)));
    throw error;
  }
  return { news };
}

async function addNewsFiles(newsId: string, form: FormData): Promise<{ news: NewsArticle }> {
  const news = (await readDemoNews()).find((item) => item.id === newsId);
  if (!news) throw notFound("News");
  const files = getNewsFiles(form);
  const addedImages = await saveNewsFiles(newsId, files, news.images.length);
  const updated = {
    ...news,
    images: [...news.images, ...addedImages],
    updatedAt: new Date().toISOString(),
  };
  try {
    await writeDemoNews((await readDemoNews()).map((item) => item.id === newsId ? updated : item));
  } catch (error) {
    await Promise.all(addedImages.map((image) => deleteDemoNewsImage(newsId, image.id)));
    throw error;
  }
  return { news: updated };
}

async function removeNewsFile(
  newsId: string,
  imageId: string,
): Promise<{ ok: true }> {
  const items = await readDemoNews();
  const news = items.find((item) => item.id === newsId);
  if (!news) throw notFound("News");
  const image = news.images.find((item) => item.id === imageId);
  if (!image) throw notFound("News image");

  const blob = await getDemoNewsImage(newsId, imageId);
  await deleteDemoNewsImage(newsId, imageId);
  const remaining = news.images
    .filter((item) => item.id !== imageId)
    .map((item, position) => ({ ...item, position }));
  const updated = { ...news, images: remaining, updatedAt: new Date().toISOString() };
  try {
    await writeDemoNews(items.map((item) => item.id === newsId ? updated : item));
  } catch (error) {
    await putDemoNewsImage(newsId, imageId, blob);
    throw error;
  }
  return { ok: true };
}

async function handleDemoApi(path: string, init: RequestInit): Promise<unknown> {
  await getDemoSessionId();
  const url = new URL(path, window.location.origin);
  const pathname = url.pathname;
  const method = (init.method ?? "GET").toUpperCase();
  const body = parseRequestBody(init);
  const parts = pathname.split("/").filter(Boolean);

  if (pathname === "/auth/me" && method === "GET") return { user: DEMO_USER };
  if (pathname === "/auth/login" && method === "POST") return { user: DEMO_USER };
  if (pathname === "/auth/logout" && method === "POST") return undefined;
  if (pathname === "/notifications" && method === "GET") {
    return { items: [], unreadCount: 0, total: 0, page: 1, pageSize: 20 };
  }
  if (pathname === "/notifications/read" && method === "POST") return undefined;

  if (parts[0] === "announcements") {
    if (parts.length === 1 && method === "GET") {
      const items = (await readDemoAnnouncements()).sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      );
      return { items };
    }
    if (parts.length === 1 && method === "POST") {
      const input = parseAnnouncementInput(body);
      const announcement = makeAnnouncement(input);
      await writeDemoAnnouncements([announcement, ...(await readDemoAnnouncements())]);
      return { announcement };
    }
    if (parts.length === 2) {
      const id = parts[1] ?? "";
      const items = await readDemoAnnouncements();
      const announcement = items.find((item) => item.id === id);
      if (!announcement) throw notFound("Announcement");
      if (method === "GET") return { announcement };
      if (method === "PATCH") {
        const changes = parseAnnouncementUpdate(body);
        const updated: Announcement = {
          ...announcement,
          ...changes,
          content:
            changes.content === undefined
              ? announcement.content
              : sanitizeAnnouncementHtml(changes.content),
          updatedAt: new Date().toISOString(),
        };
        await writeDemoAnnouncements(items.map((item) => item.id === id ? updated : item));
        return { announcement: updated };
      }
    }
    if (parts.length === 3 && parts[2] === "publish" && method === "POST") {
      const id = parts[1] ?? "";
      const items = await readDemoAnnouncements();
      const announcement = items.find((item) => item.id === id);
      if (!announcement) throw notFound("Announcement");
      const updated: Announcement = {
        ...announcement,
        status: "published",
        publishedAt: announcement.publishedAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await writeDemoAnnouncements(items.map((item) => item.id === id ? updated : item));
      return { announcement: updated };
    }
  }

  if (parts[0] === "news") {
    if (parts.length === 1 && method === "GET") {
      const items = (await readDemoNews()).sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      );
      return { items };
    }
    if (parts.length === 1 && method === "POST") {
      if (!(body instanceof FormData)) {
        throw new DemoApiError(400, "BAD_REQUEST", "News must be submitted as multipart form data");
      }
      return saveNewsCreate(body);
    }
    if (parts.length === 2) {
      const id = parts[1] ?? "";
      const items = await readDemoNews();
      const news = items.find((item) => item.id === id);
      if (!news) throw notFound("News");
      if (method === "GET") return { news };
      if (method === "PATCH") {
        const changes = parseNewsUpdate(body);
        const updated: NewsArticle = {
          ...news,
          ...changes,
          content:
            changes.content === undefined
              ? news.content
              : sanitizeAnnouncementHtml(changes.content),
          updatedAt: new Date().toISOString(),
        };
        await writeDemoNews(items.map((item) => item.id === id ? updated : item));
        return { news: updated };
      }
    }
    if (parts.length === 3 && parts[2] === "images" && method === "POST") {
      if (!(body instanceof FormData)) {
        throw new DemoApiError(400, "BAD_REQUEST", "Images must be submitted as multipart form data");
      }
      return addNewsFiles(parts[1] ?? "", body);
    }
    if (parts.length === 4 && parts[2] === "images" && method === "DELETE") {
      return removeNewsFile(parts[1] ?? "", parts[3] ?? "");
    }
    if (parts.length === 4 && parts[2] === "images" && method === "GET") {
      return getDemoNewsImage(parts[1] ?? "", parts[3] ?? "");
    }
    if (parts.length === 3 && parts[2] === "publish" && method === "POST") {
      const id = parts[1] ?? "";
      const items = await readDemoNews();
      const news = items.find((item) => item.id === id);
      if (!news) throw notFound("News");
      const updated = {
        ...news,
        status: "published" as const,
        publishedAt: news.publishedAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await writeDemoNews(items.map((item) => item.id === id ? updated : item));
      return { news: updated };
    }
  }

  throw new DemoApiError(
    501,
    "DEMO_UNSUPPORTED",
    `Demo Mode does not implement ${method} ${pathname}`,
  );
}

export async function demoApi<T>(path: string, init: RequestInit): Promise<T> {
  try {
    return (await handleDemoApi(path, init)) as T;
  } catch (error) {
    if (error instanceof DemoStorageError) {
      throw new DemoApiError(507, "DEMO_STORAGE_ERROR", error.message);
    }
    throw error;
  }
}
