import { describe, expect, it } from "vitest";
import { AppError } from "../src/lib/errors.js";
import {
  MAX_NEWS_IMAGE_BYTES,
  MAX_NEWS_IMAGES,
  validateNewsImageCount,
  validateNewsImages,
} from "../src/modules/news/image-validation.js";
import {
  newsFieldsSchema,
  parseNewsMultipartFields,
} from "../src/modules/news/schemas.js";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
const image = (overrides: Partial<Parameters<typeof validateNewsImages>[0][number]> = {}) => ({
  buffer: jpeg,
  filename: "poster.jpg",
  mimeType: "image/jpeg",
  ...overrides,
});

describe("news validation", () => {
  it("accepts known tags and multipart fields", () => {
    expect(
      parseNewsMultipartFields({
        title: "Campus event",
        content: "<p>Details</p>",
        tags: '["activities","academic"]',
      }),
    ).toEqual({
      title: "Campus event",
      content: "<p>Details</p>",
      tags: ["activities", "academic"],
    });
  });

  it("rejects unknown and duplicate tags", () => {
    expect(
      newsFieldsSchema.safeParse({
        title: "News",
        content: "<p>Details</p>",
        tags: ["unknown"],
      }).success,
    ).toBe(false);
    expect(
      newsFieldsSchema.safeParse({
        title: "News",
        content: "<p>Details</p>",
        tags: ["activities", "activities"],
      }).success,
    ).toBe(false);
  });

  it("accepts a valid image, sanitizes its filename, and enforces count and size limits", () => {
    expect(validateNewsImages([image({ filename: "poster\u0000.jpg" })])[0]?.filename).toBe(
      "poster.jpg",
    );
    expect(
      () => validateNewsImages(Array.from({ length: MAX_NEWS_IMAGES + 1 }, () => image())),
    ).toThrow(AppError);
    expect(
      () =>
        validateNewsImages([
          image({ buffer: Buffer.alloc(MAX_NEWS_IMAGE_BYTES + 1, 0xff) }),
        ]),
    ).toThrow(AppError);
  });

  it("enforces the article-wide image limit when adding to existing images", () => {
    expect(() => validateNewsImageCount(MAX_NEWS_IMAGES - 2, 2)).not.toThrow();
    expect(() => validateNewsImageCount(MAX_NEWS_IMAGES - 1, 2)).toThrow(AppError);
  });

  it("rejects files whose declared MIME type does not match an allowed image signature", () => {
    expect(() => validateNewsImages([image({ mimeType: "image/png" })])).toThrow(AppError);
  });
});
