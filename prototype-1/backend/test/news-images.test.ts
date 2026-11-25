import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { fileStore } from "../src/core/file-store.js";
import { prisma } from "../src/db.js";
import { addNewsImages, createNews } from "../src/modules/news/service.js";
import { idOf, loginAs } from "./helpers/session.js";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("png-body")]);
let app: FastifyInstance;
let staffCookie = "";
let newsId = "";

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  staffCookie = await loginAs(app, "staff@test.local");
  const author = await idOf(prisma, "staff@test.local");
  const { news } = await createNews(author, { title: "Step 6 test news", content: "<p>x</p>", tags: [] }, [
    { filename: "poster.png", mimeType: "image/png", buffer: PNG },
  ]);
  newsId = news.id;
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

const imageUrl = (imageId: string) => `/api/v1/news/${newsId}/images/${imageId}`;

describe("news images in fileStore", () => {
  it("saves the image as a files row and serves it to staff", async () => {
    const image = await prisma.newsImage.findFirstOrThrow({ where: { newsId }, include: { file: true } });
    expect(image.file).toMatchObject({ module: "news", mime: "image/png", originalName: "poster.png" });
    const res = await app.inject({ method: "GET", url: imageUrl(image.id), headers: { cookie: staffCookie } });
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.equals(PNG)).toBe(true);
  });

  it("hides images of a draft from the public", async () => {
    const image = await prisma.newsImage.findFirstOrThrow({ where: { newsId } });
    expect((await app.inject({ method: "GET", url: imageUrl(image.id) })).statusCode).toBe(404);
  });

  it("removes the files row and the contents when an image is deleted", async () => {
    const { news } = await addNewsImages(newsId, [{ filename: "second.png", mimeType: "image/png", buffer: PNG }]);
    const added = news.images.find((i) => i.originalName === "second.png")!;
    const row = await prisma.newsImage.findUniqueOrThrow({ where: { id: added.id }, include: { file: true } });
    const res = await app.inject({
      method: "DELETE",
      url: imageUrl(added.id),
      headers: { cookie: staffCookie, "x-requested-with": "XMLHttpRequest" },
    });
    expect(res.statusCode).toBe(200);
    expect(await prisma.file.count({ where: { id: row.file!.id } })).toBe(0);
    await expect(fileStore.get(row.file!.storageKey)).rejects.toThrow();
  });
});
