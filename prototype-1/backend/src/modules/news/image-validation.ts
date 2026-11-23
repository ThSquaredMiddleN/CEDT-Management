import { badRequest } from "../../lib/errors.js";

export const MAX_NEWS_IMAGES = 10;
export const MAX_NEWS_IMAGE_BYTES = 10 * 1024 * 1024;

export interface IncomingNewsImage {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export function validateNewsImageCount(existingCount: number, incomingCount: number): void {
  if (existingCount + incomingCount > MAX_NEWS_IMAGES) {
    throw badRequest(`A news article can have at most ${MAX_NEWS_IMAGES} images`);
  }
}

const imageSignatures: Record<string, (buffer: Buffer) => boolean> = {
  "image/jpeg": (buffer) =>
    buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  "image/png": (buffer) =>
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
};

export function validateNewsImages(files: readonly IncomingNewsImage[]): IncomingNewsImage[] {
  if (files.length > MAX_NEWS_IMAGES) {
    throw badRequest(`A news article can have at most ${MAX_NEWS_IMAGES} images`);
  }

  return files.map((file) => {
    if (file.buffer.length === 0 || file.buffer.length > MAX_NEWS_IMAGE_BYTES) {
      throw badRequest("Each image must be smaller than or equal to 10 MB");
    }

    const matchesSignature = imageSignatures[file.mimeType]?.(file.buffer) ?? false;
    if (!matchesSignature) {
      throw badRequest("Only valid JPG and PNG image files are supported");
    }

    return {
      ...file,
      filename: file.filename.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 255) || "poster",
    };
  });
}
