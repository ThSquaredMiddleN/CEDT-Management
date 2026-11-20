import { prisma } from "../../db.js";
import { notFound } from "../../lib/errors.js";
import type { AnnouncementCreateInput, AnnouncementUpdateInput } from "./schemas.js";
import { sanitizeAnnouncementContent } from "./sanitizer.js";

const announcementSelection = {
  id: true,
  title: true,
  content: true,
  audiences: true,
  status: true,
  authorId: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function listAnnouncements() {
  const items = await prisma.announcement.findMany({
    select: announcementSelection,
    orderBy: { updatedAt: "desc" },
  });
  return { items };
}

export async function getAnnouncement(id: string) {
  const announcement = await prisma.announcement.findUnique({
    where: { id },
    select: announcementSelection,
  });
  if (!announcement) throw notFound("Announcement not found");
  return { announcement };
}

export async function createAnnouncement(authorId: string, input: AnnouncementCreateInput) {
  const announcement = await prisma.announcement.create({
    data: {
      ...input,
      content: sanitizeAnnouncementContent(input.content),
      authorId,
    },
    select: announcementSelection,
  });
  return { announcement };
}

export async function updateAnnouncement(id: string, input: AnnouncementUpdateInput) {
  const existing = await prisma.announcement.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw notFound("Announcement not found");

  const announcement = await prisma.announcement.update({
    where: { id },
    data: {
      ...input,
      ...(input.content === undefined
        ? {}
        : { content: sanitizeAnnouncementContent(input.content) }),
    },
    select: announcementSelection,
  });
  return { announcement };
}

export async function publishAnnouncement(id: string) {
  const existing = await prisma.announcement.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) throw notFound("Announcement not found");

  if (existing.status === "draft") {
    await prisma.announcement.update({
      where: { id },
      data: { status: "published", publishedAt: new Date() },
    });
  }
  return getAnnouncement(id);
}
