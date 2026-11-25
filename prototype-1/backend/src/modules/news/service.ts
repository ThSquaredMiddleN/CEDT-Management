import { prisma } from "../../db.js";
import { notFound } from "../../lib/errors.js";
import { sanitizeAnnouncementContent } from "../announcements/sanitizer.js";
import {
  validateNewsImageCount,
  validateNewsImages,
  type IncomingNewsImage,
} from "./image-validation.js";
import type { NewsFields, NewsUpdate } from "./schemas.js";
import { deleteFileRecord, readFile, withFileTransaction, type FileWriter } from "../../core/files.js";

const newsSelection = {
  id: true,
  title: true,
  content: true,
  tags: true,
  status: true,
  authorId: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  images: {
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      position: true,
    },
    orderBy: { position: "asc" as const },
  },
} as const;

function sanitizedFields<T extends NewsFields | NewsUpdate>(fields: T): T {
  return {
    ...fields,
    ...(fields.content === undefined
      ? {}
      : { content: sanitizeAnnouncementContent(fields.content) }),
  };
}

export async function listNews(options: { publishedOnly?: boolean } = {}) {
  const items = await prisma.newsArticle.findMany({
    where: options.publishedOnly ? { status: "published" } : undefined,
    select: newsSelection,
    orderBy: options.publishedOnly
      ? [{ publishedAt: "desc" }, { updatedAt: "desc" }]
      : { updatedAt: "desc" },
  });
  return { items };
}

export async function getNews(id: string, options: { publishedOnly?: boolean } = {}) {
  const news = await prisma.newsArticle.findUnique({
    where: { id },
    select: newsSelection,
  });
  if (!news || (options.publishedOnly && news.status !== "published")) {
    throw notFound("News not found");
  }
  return { news };
}

async function storeImages(files: FileWriter, images: readonly IncomingNewsImage[], firstPosition: number, authorId: string | null) {
  const stored = [];
  for (const [index, image] of images.entries()) {
    const file = await files.save({
      buffer: image.buffer,
      mime: image.mimeType,
      originalName: image.filename,
      module: "news",
      uploadedBy: authorId,
    });
    stored.push({
      fileId: file.id,
      originalName: image.filename,
      mimeType: image.mimeType,
      sizeBytes: image.buffer.length,
      position: firstPosition + index,
    });
  }
  return stored;
}

export async function createNews(
  authorId: string,
  fields: NewsFields,
  incomingImages: readonly IncomingNewsImage[],
) {
  const images = validateNewsImages(incomingImages);
  const news = await withFileTransaction(async (tx, files) => {
    const storedImages = await storeImages(files, images, 0, authorId);
    return tx.newsArticle.create({
      data: { ...sanitizedFields(fields), authorId, images: { create: storedImages } },
      select: newsSelection,
    });
  });
  return { news };
}

export async function updateNews(id: string, fields: NewsUpdate) {
  const existing = await prisma.newsArticle.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw notFound("News not found");

  const news = await prisma.newsArticle.update({
    where: { id },
    data: sanitizedFields(fields),
    select: newsSelection,
  });
  return { news };
}

export async function addNewsImages(id: string, incomingImages: readonly IncomingNewsImage[]) {
  const images = validateNewsImages(incomingImages);
  if (images.length === 0) return getNews(id);

  const news = await withFileTransaction(async (tx, files) => {
    await tx.$queryRaw`SELECT "id" FROM "news_articles" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const existing = await tx.newsArticle.findUnique({
      where: { id },
      select: { id: true, _count: { select: { images: true } } },
    });
    if (!existing) throw notFound("News not found");
    validateNewsImageCount(existing._count.images, images.length);

    const storedImages = (await storeImages(files, images, existing._count.images, null)).map((img) => ({
      ...img,
      newsId: id,
    }));

    await tx.newsImage.createMany({ data: storedImages });
    await tx.newsArticle.update({ where: { id }, data: { updatedAt: new Date() } });
    return tx.newsArticle.findUniqueOrThrow({ where: { id }, select: newsSelection });
  });
  return { news };
}

export async function removeNewsImageRecord(id: string, imageId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "news_articles" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const image = await tx.newsImage.findFirst({
      where: { id: imageId, newsId: id },
      select: { id: true, fileId: true },
    });
    if (!image) throw notFound("News image not found");

    await tx.newsImage.delete({ where: { id: imageId } });
    const storageKey = image.fileId ? await deleteFileRecord(tx, image.fileId) : null;
    const remaining = await tx.newsImage.findMany({
      where: { newsId: id },
      select: { id: true },
      orderBy: { position: "asc" },
    });
    for (const [position, item] of remaining.entries()) {
      await tx.newsImage.update({ where: { id: item.id }, data: { position } });
    }
    await tx.newsArticle.update({ where: { id }, data: { updatedAt: new Date() } });

    return { storageKey };
  });
}

export async function getNewsImageRecord(
  id: string,
  imageId: string,
  options: { publishedOnly?: boolean } = {},
) {
  const image = await prisma.newsImage.findFirst({
    where: {
      id: imageId,
      newsId: id,
      ...(options.publishedOnly ? { news: { status: "published" } } : {}),
    },
    select: { fileId: true, mimeType: true, originalName: true },
  });
  if (!image) throw notFound("News image not found");
  return image;
}

export async function readNewsImageBytes(fileId: string | null): Promise<Buffer> {
  if (!fileId) throw notFound("News image not found");
  return (await readFile(fileId)).buffer;
}

export async function publishNews(id: string) {
  const existing = await prisma.newsArticle.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) throw notFound("News not found");
  if (existing.status === "draft") {
    await prisma.newsArticle.update({
      where: { id },
      data: { status: "published", publishedAt: new Date() },
    });
  }
  return getNews(id);
}
