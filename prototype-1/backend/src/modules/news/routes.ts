import type { FastifyInstance, FastifyRequest } from "fastify";
import { requireUser } from "../../plugins/auth.js";
import { badRequest } from "../../lib/errors.js";
import {
  MAX_NEWS_IMAGE_BYTES,
  MAX_NEWS_IMAGES,
  type IncomingNewsImage,
} from "./image-validation.js";
import {
  newsIdSchema,
  newsImageIdSchema,
  newsUpdateSchema,
  parseNewsMultipartFields,
} from "./schemas.js";
import {
  addNewsImages,
  createNews,
  getNews,
  getNewsImageRecord,
  listNews,
  publishNews,
  removeNewsImageRecord,
  updateNews,
} from "./service.js";
import { readNewsImage, removeNewsImage } from "./storage.js";

const multipartLimits = {
  fileSize: MAX_NEWS_IMAGE_BYTES,
  files: MAX_NEWS_IMAGES + 1,
  fields: 3,
  parts: MAX_NEWS_IMAGES + 4,
};

function isFileTooLarge(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "FST_REQ_FILE_TOO_LARGE"
  );
}

function multipartLimitCode(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return undefined;
}

async function readMultipart(
  req: FastifyRequest,
  allowFields: boolean,
): Promise<{ fields: Record<string, unknown>; images: IncomingNewsImage[] }> {
  const fields: Record<string, unknown> = {};
  const images: IncomingNewsImage[] = [];
  try {
    for await (const part of req.parts({ limits: multipartLimits })) {
      if (part.type === "file") {
        if (part.fieldname !== "images") throw badRequest("Files must use the images field");
        const buffer = await part.toBuffer();
        if (part.file.truncated || buffer.length > MAX_NEWS_IMAGE_BYTES) {
          throw badRequest("Each image must be smaller than or equal to 10 MB");
        }
        images.push({
          buffer,
          filename: part.filename,
          mimeType: part.mimetype,
        });
        continue;
      }

      if (!allowFields) throw badRequest("Only image files are accepted");
      if (!["title", "content", "tags"].includes(part.fieldname)) {
        throw badRequest("Unexpected form field");
      }
      if (fields[part.fieldname] !== undefined || typeof part.value !== "string") {
        throw badRequest("Form fields must be provided once as text");
      }
      fields[part.fieldname] = part.value;
    }
  } catch (error) {
    if (isFileTooLarge(error)) throw badRequest("Each image must be smaller than or equal to 10 MB");
    const limitCode = multipartLimitCode(error);
    if (limitCode === "FST_FILES_LIMIT") {
      throw badRequest(`A news article can have at most ${MAX_NEWS_IMAGES} images`);
    }
    if (limitCode === "FST_FIELDS_LIMIT" || limitCode === "FST_PARTS_LIMIT") {
      throw badRequest("The upload contains too many form fields or files");
    }
    throw error;
  }
  return { fields, images };
}

export async function newsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/news", { config: { auth: "admin" } }, async () => listNews());

  app.get("/news/:id", { config: { auth: "admin" } }, async (req) => {
    const { id } = newsIdSchema.parse(req.params);
    return getNews(id);
  });

  app.post("/news", { config: { auth: "admin" } }, async (req, reply) => {
    const { fields, images } = await readMultipart(req, true);
    const newsFields = parseNewsMultipartFields(fields);
    const user = requireUser(req);
    return reply.code(201).send(await createNews(user.id, newsFields, images));
  });

  app.patch("/news/:id", { config: { auth: "admin" } }, async (req) => {
    const { id } = newsIdSchema.parse(req.params);
    const fields = newsUpdateSchema.parse(req.body);
    return updateNews(id, fields);
  });

  app.post("/news/:id/images", { config: { auth: "admin" } }, async (req) => {
    const { id } = newsIdSchema.parse(req.params);
    const { images } = await readMultipart(req, false);
    return addNewsImages(id, images);
  });

  app.delete("/news/:id/images/:imageId", { config: { auth: "admin" } }, async (req) => {
    const { id, imageId } = newsImageIdSchema.parse(req.params);
    const { storageKey } = await removeNewsImageRecord(id, imageId);
    try {
      await removeNewsImage(storageKey);
    } catch (error) {
      req.log.error({ err: error, storageKey }, "Failed to remove news image from disk");
    }
    return { ok: true };
  });

  app.get("/news/:id/images/:imageId", { config: { auth: "admin" } }, async (req, reply) => {
    const { id, imageId } = newsImageIdSchema.parse(req.params);
    const image = await getNewsImageRecord(id, imageId);
    const bytes = await readNewsImage(image.storageKey);
    return reply
      .type(image.mimeType)
      .header("Content-Disposition", `inline; filename="${encodeURIComponent(image.originalName)}"`)
      .header("X-Content-Type-Options", "nosniff")
      .header("Cache-Control", "private, max-age=3600")
      .send(bytes);
  });

  app.post("/news/:id/publish", { config: { auth: "admin" } }, async (req) => {
    const { id } = newsIdSchema.parse(req.params);
    return publishNews(id);
  });
}
